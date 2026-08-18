import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import bcrypt from 'bcryptjs';

import { RequestContextService } from '../audit/request-context.service';
import type { JwtPayload } from '../auth/auth.types';
import { merchantScope } from '../common/tenant-scope';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionalEmailService } from '../notifications/transactional-email.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly context: RequestContextService,
    private readonly transactionalEmail: TransactionalEmailService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedSuperAdmin();
  }

  list() {
    return this.prisma.user.findMany({
      where: { ...merchantScope(this.context.get()) },
      orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
      include: { branchAccess: { select: { branchId: true } } },
    });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async create(input: CreateUserDto, actor: JwtPayload): Promise<User> {
    const email = input.email.toLowerCase().trim();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('A user with that email already exists.');
    }

    // Use the verified JWT supplied by @CurrentUser instead of relying on an
    // interceptor to copy the actor into AsyncLocalStorage before this method
    // runs. The global JwtAuthGuard is the authoritative identity source.
    const isSuperAdmin = actor.role === 'SUPER_ADMIN';
    const isCreatingSuperAdmin = input.role === 'SUPER_ADMIN';

    if (isSuperAdmin && isCreatingSuperAdmin) {
      this.logger.log(`SUPER_ADMIN creating another SUPER_ADMIN: ${email}`);
      const created = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email,
            passwordHash: await UsersService.hashPassword(input.password),
            name: input.name?.trim() || null,
            role: 'SUPER_ADMIN',
            merchantId: null,
            branchId: null,
            emailVerifiedAt: new Date(),
          },
        });
        return tx.user.findUniqueOrThrow({
          where: { id: created.id },
          include: { branchAccess: { select: { branchId: true } } },
        });
      });
      void this.transactionalEmail.notify({
        type: 'ACCOUNT_CREATED',
        to: created.email,
        name: created.name,
        accountType: roleLabel(created.role),
      });
      return created;
    }

    if (isCreatingSuperAdmin) {
      throw new ForbiddenException(
        'SUPER_ADMIN role can only be created by an existing SUPER_ADMIN.',
      );
    }

    const tenant = await this.resolveTenantForCreate(input);
    const branchGrants = await this.resolveBranchGrants(
      input.role,
      tenant.merchantId,
      input.branchIds,
      input.branchId ?? null,
    );

    const created = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash: await UsersService.hashPassword(input.password),
          name: input.name?.trim() || null,
          role: input.role,
          merchantId: tenant.merchantId,
          branchId: branchGrants.pinnedBranchId,
          emailVerifiedAt: new Date(),
        },
      });

      if (branchGrants.branchIds.length > 0) {
        await tx.userBranch.createMany({
          data: branchGrants.branchIds.map((branchId) => ({
            userId: created.id,
            branchId,
          })),
        });
      }

      return tx.user.findUniqueOrThrow({
        where: { id: created.id },
        include: { branchAccess: { select: { branchId: true } } },
      });
    });
    if (isSuperAdmin) {
      void this.transactionalEmail.notify({
        type: 'ACCOUNT_CREATED',
        to: created.email,
        name: created.name,
        accountType: roleLabel(created.role),
      });
    }
    return created;
  }

  private async resolveBranchGrants(
    role: User['role'],
    merchantId: string,
    branchIds: string[] | undefined,
    pinnedInput: string | null,
  ): Promise<{ branchIds: string[]; pinnedBranchId: string | null }> {
    if (role === 'MERCHANT_ADMIN') {
      const pinnedBranchId = pinnedInput?.trim() || null;
      if (pinnedBranchId) {
        await this.assertBranchUsable(merchantId, pinnedBranchId);
      }
      return { branchIds: [], pinnedBranchId };
    }

    const ids = (branchIds ?? []).map((id) => id.trim()).filter(Boolean);
    if (role === 'BRANCH_ADMIN' && ids.length !== 1) {
      throw new ConflictException(
        'A branch administrator must be assigned to exactly one branch.',
      );
    }
    for (const id of ids) {
      await this.assertBranchUsable(merchantId, id);
    }

    let pinnedBranchId: string | null = null;
    if (pinnedInput && pinnedInput.trim()) {
      const pin = pinnedInput.trim();
      if (!ids.includes(pin)) {
        throw new ConflictException(
          'The pinned branch must be one of the granted branchIds.',
        );
      }
      pinnedBranchId = pin;
    } else if (ids.length > 0) {
      pinnedBranchId = ids[0]!;
    }

    return { branchIds: ids, pinnedBranchId };
  }

  private async assertBranchUsable(
    merchantId: string,
    branchId: string,
  ): Promise<void> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { merchantId: true },
    });
    if (!branch || branch.merchantId !== merchantId) {
      throw new NotFoundException(
        `Branch ${branchId} does not belong to this merchant.`,
      );
    }
  }

  private async resolveTenantForCreate(input: CreateUserDto): Promise<{
    merchantId: string;
    branchId: string | null;
  }> {
    const ctx = this.context.get();
    const callerMerchantId = ctx?.merchantId ?? null;

    let merchantId = input.merchantId?.trim() || null;
    if (callerMerchantId) {
      if (merchantId && merchantId !== callerMerchantId) {
        throw new ForbiddenException(
          'You can only create users within your own merchant.',
        );
      }
      merchantId = callerMerchantId;
    } else if (!merchantId) {
      // Get the first available merchant
      const firstMerchant = await this.prisma.merchant.findFirst({
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });

      if (!firstMerchant) {
        throw new NotFoundException(
          'No merchant found. Please create a merchant first.',
        );
      }
      merchantId = firstMerchant.id;
    }

    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true },
    });
    if (!merchant) {
      throw new NotFoundException(`Merchant ${merchantId} not found.`);
    }

    const requested =
      input.branchId === undefined || input.branchId === null
        ? null
        : input.branchId.trim() || null;
    let branchId: string | null = null;
    if (requested) {
      const branch = await this.prisma.branch.findUnique({
        where: { id: requested },
        select: { merchantId: true, active: true },
      });
      if (!branch || branch.merchantId !== merchantId) {
        throw new NotFoundException(
          `Branch ${requested} does not belong to merchant ${merchantId}.`,
        );
      }
      if (!branch.active) {
        throw new ConflictException(
          'That branch is disabled — pick an active branch or grant any-branch access.',
        );
      }
      branchId = requested;
    }

    return { merchantId, branchId };
  }

  private async getDefaultTenantForRole(role: User['role']): Promise<{
    merchantId: string | null;
    branchId: string | null;
  }> {
    if (role === 'SUPER_ADMIN') {
      return { merchantId: null, branchId: null };
    }

    const firstMerchant = await this.prisma.merchant.findFirst({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!firstMerchant) {
      this.logger.warn(
        'No merchant found. Non-super admin users cannot be created without a merchant.',
      );
      return { merchantId: null, branchId: null };
    }

    let branchId: string | null = null;
    if (role === 'CASHIER') {
      const firstBranch = await this.prisma.branch.findFirst({
        where: { merchantId: firstMerchant.id, active: true },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      branchId = firstBranch?.id || null;
    }

    return {
      merchantId: firstMerchant.id,
      branchId,
    };
  }

  async update(
    id: string,
    actorId: string,
    input: UpdateUserDto,
  ): Promise<User> {
    const target = await this.prisma.user.findFirst({
      where: { id, ...merchantScope(this.context.get()) },
    });
    if (!target) throw new NotFoundException('User not found.');

    const ctx = this.context.get();
    const isSuperAdmin = ctx?.actorRole === 'SUPER_ADMIN';

    if (target.role === 'SUPER_ADMIN' && !isSuperAdmin) {
      throw new ForbiddenException(
        'Only SUPER_ADMIN can edit SUPER_ADMIN accounts.',
      );
    }

    if (id === actorId && input.active === false) {
      throw new ForbiddenException("You can't deactivate your own account.");
    }

    const nextRole = input.role ?? target.role;
    if (nextRole === 'SUPER_ADMIN' && !isSuperAdmin) {
      throw new ForbiddenException(
        'Only SUPER_ADMIN can grant the SUPER_ADMIN role.',
      );
    }
    const merchantId = target.merchantId;
    const grantsProvided = input.branchIds !== undefined;
    let nextGrants: string[] | null = null;
    let nextPinned: string | null | undefined = undefined;

    if (nextRole === 'SUPER_ADMIN') {
      // Promotion to technical administrator must remove every tenant/branch
      // binding. Leaving stale grants behind makes later authorization and UI
      // context resolution unpredictable.
      nextGrants = [];
      nextPinned = null;
    } else if (grantsProvided || input.branchId !== undefined) {
      if (!merchantId) {
        throw new ConflictException(
          "This user has no merchant — can't assign branch access.",
        );
      }
      const resolved = await this.resolveBranchGrants(
        nextRole,
        merchantId,
        grantsProvided ? input.branchIds : undefined,
        input.branchId === undefined
          ? (target.branchId ?? null)
          : (input.branchId ?? null),
      );
      if (grantsProvided) nextGrants = resolved.branchIds;
      if (input.branchId !== undefined || grantsProvided) {
        nextPinned = resolved.pinnedBranchId;
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          name:
            input.name === undefined ? undefined : input.name?.trim() || null,
          role: input.role,
          active: input.active,
          merchantId: nextRole === 'SUPER_ADMIN' ? null : undefined,
          branchId: nextPinned,
          passwordHash: input.password
            ? await UsersService.hashPassword(input.password)
            : undefined,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });

      if (nextGrants !== null) {
        await tx.userBranch.deleteMany({ where: { userId: id } });
        if (nextGrants.length > 0) {
          await tx.userBranch.createMany({
            data: nextGrants.map((branchId) => ({ userId: id, branchId })),
          });
        }
      }

      return tx.user.findUniqueOrThrow({
        where: { id },
        include: { branchAccess: { select: { branchId: true } } },
      });
    });
    if (isSuperAdmin) {
      const changedFields = userChangedFields(target, input);
      if (changedFields.length > 0) {
        void this.transactionalEmail.notify({
          type: 'ACCOUNT_UPDATED',
          to: updated.email,
          name: updated.name,
          changedFields,
        });
      }
    }
    return updated;
  }

  recordLogin(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: {
        lastLoginAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
  }

  recordFailedLogin(
    id: string,
    threshold: number,
    lockoutMs: number,
  ): Promise<User> {
    return this.prisma.user
      .update({
        where: { id },
        data: {
          failedLoginCount: { increment: 1 },
        },
      })
      .then(async (row) => {
        if (row.failedLoginCount >= threshold && !row.lockedUntil) {
          return this.prisma.user.update({
            where: { id },
            data: { lockedUntil: new Date(Date.now() + lockoutMs) },
          });
        }
        return row;
      });
  }

  clearLockout(id: string): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }

  async unlock(id: string) {
    const target = await this.prisma.user.findFirst({
      where: { id, ...merchantScope(this.context.get()) },
    });
    if (!target) throw new NotFoundException('User not found.');

    const ctx = this.context.get();
    const isSuperAdmin = ctx?.actorRole === 'SUPER_ADMIN';
    if (target.role === 'SUPER_ADMIN' && !isSuperAdmin) {
      throw new ForbiddenException(
        'Only SUPER_ADMIN can unlock other SUPER_ADMINs.',
      );
    }

    await this.clearLockout(id);
    return this.prisma.user.findUniqueOrThrow({
      where: { id },
      include: { branchAccess: { select: { branchId: true } } },
    });
  }

  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  static async verifyPassword(
    password: string,
    hash: string,
  ): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Seeds super admin from environment variables.
   * Uses SEED_SUPER_ADMIN_EMAIL and SEED_SUPER_ADMIN_PASSWORD from .env
   * No hardcoded credentials!
   */
  private async seedSuperAdmin(): Promise<void> {
    const seedSuperEmail =
      process.env.SEED_SUPER_ADMIN_EMAIL?.toLowerCase().trim();
    const seedSuperPassword = process.env.SEED_SUPER_ADMIN_PASSWORD;
    const seedSuperName =
      process.env.SEED_SUPER_ADMIN_NAME || 'System Super Admin';
    const demoPassword = process.env.SEED_DEMO_PASSWORD || 'epaypassword';

    if (!seedSuperEmail || !seedSuperPassword) {
      this.logger.warn(
        '⚠️  SEED_SUPER_ADMIN_EMAIL or SEED_SUPER_ADMIN_PASSWORD not set in .env. ' +
          'No super admin will be seeded automatically.',
      );

      const existingSuperAdmin = await this.prisma.user.findFirst({
        where: { role: 'SUPER_ADMIN' },
      });

      if (!existingSuperAdmin) {
        this.logger.warn(
          '⚠️  No super admin exists in the database. ' +
            'Create one manually or set SEED_SUPER_ADMIN_EMAIL and SEED_SUPER_ADMIN_PASSWORD in .env',
        );
      }
      return;
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: seedSuperEmail },
    });

    if (existing) {
      if (existing.role !== 'SUPER_ADMIN') {
        await this.prisma.user.update({
          where: { email: seedSuperEmail },
          data: { role: 'SUPER_ADMIN' },
        });
        this.logger.log(`✅ Updated ${seedSuperEmail} to SUPER_ADMIN role.`);
      }
      this.logger.log(`✅ Super admin already exists: ${seedSuperEmail}`);
      return;
    }

    try {
      await this.prisma.user.create({
        data: {
          email: seedSuperEmail,
          passwordHash: await UsersService.hashPassword(seedSuperPassword),
          name: seedSuperName,
          role: 'SUPER_ADMIN',
          active: true,
          merchantId: null,
          branchId: null,
          emailVerifiedAt: new Date(),
        },
      });
      this.logger.log(
        `✅ Super admin created: ${seedSuperEmail} (${seedSuperName})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to create super admin: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    await this.seedDemoUsers(demoPassword);
  }

  private async seedDemoUsers(demoPassword: string): Promise<void> {
    if (process.env.SEED_DEMO_USERS !== 'true') {
      return;
    }

    const firstMerchant = await this.prisma.merchant.findFirst({
      select: { id: true },
    });

    if (!firstMerchant) {
      this.logger.warn('No merchant found - skipping demo user seeding.');
      return;
    }

    const demoUsers = [
      {
        email: process.env.DEMO_MERCHANT_ADMIN_EMAIL || 'merchantadmin@demo.et',
        name: 'Demo Merchant Admin',
        role: 'MERCHANT_ADMIN' as const,
      },
      {
        email: process.env.DEMO_ACCOUNTANT_EMAIL || 'accountant@demo.et',
        name: 'Demo Accountant',
        role: 'ACCOUNTANT' as const,
      },
      {
        email: process.env.DEMO_CASHIER_EMAIL || 'cashier@demo.et',
        name: 'Demo Cashier',
        role: 'CASHIER' as const,
      },
      {
        email: process.env.DEMO_SUPPORT_EMAIL || 'support@demo.et',
        name: 'Demo Support',
        role: 'SUPPORT' as const,
      },
    ];

    for (const demoUser of demoUsers) {
      const existing = await this.prisma.user.findUnique({
        where: { email: demoUser.email },
      });

      if (existing) continue;

      const tenant = await this.getDefaultTenantForRole(demoUser.role);

      await this.prisma.user.create({
        data: {
          email: demoUser.email,
          passwordHash: await UsersService.hashPassword(demoPassword),
          name: demoUser.name,
          role: demoUser.role,
          merchantId: tenant.merchantId || firstMerchant.id,
          branchId: tenant.branchId,
          active: true,
          emailVerifiedAt: new Date(),
        },
      });

      this.logger.log(
        `✅ Seeded demo ${demoUser.role.toLowerCase()}: ${demoUser.email}`,
      );
    }
  }
}

function roleLabel(role: User['role']): string {
  return role
    .toLowerCase()
    .split('_')
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(' ');
}

function userChangedFields(target: User, input: UpdateUserDto): string[] {
  const changed: string[] = [];
  if (input.name !== undefined && (input.name.trim() || null) !== target.name)
    changed.push('Name');
  if (input.role !== undefined && input.role !== target.role)
    changed.push('Account role');
  if (input.active !== undefined && input.active !== target.active)
    changed.push('Account status');
  if (input.password) changed.push('Password');
  if (input.branchIds !== undefined || input.branchId !== undefined)
    changed.push('Branch access');
  return changed;
}
