import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { User } from '@prisma/client';

import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/auth.types';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

interface SafeUser {
  id: string;
  email: string;
  name: string | null;
  role: User['role'];
  active: boolean;
  merchantId: string | null;
  branchId: string | null;
  branchIds: string[];
  lastLoginAt: Date | null;
  lockedUntil: Date | null;
  failedLoginCount: number;
  createdAt: Date;
  updatedAt: Date;
}

type UserWithBranches = User & { branchAccess?: { branchId: string }[] };

function toSafe(u: UserWithBranches): SafeUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    active: u.active,
    merchantId: u.merchantId,
    branchId: u.branchId,
    branchIds: (u.branchAccess ?? []).map((row) => row.branchId),
    lastLoginAt: u.lastLoginAt,
    lockedUntil: u.lockedUntil,
    failedLoginCount: u.failedLoginCount,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('user.view')
  @ApiOperation({ summary: 'Paginated, filtered users in the permitted scope' })
  async list(@Query() query: QueryUsersDto): Promise<{
    items: SafeUser[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const page = await this.users.list(query);
    return { ...page, items: page.items.map(toSafe) };
  }

  @Post()
  @RequirePermissions('user.create')
  @ApiOperation({
    summary: 'Create a new user',
    description:
      'A SUPER_ADMIN can create any role, including another SUPER_ADMIN. Merchant admins remain restricted to their own tenant and cannot create SUPER_ADMIN accounts.',
  })
  async create(
    @Body() body: CreateUserDto,
    @CurrentUser() actor: JwtPayload,
  ): Promise<SafeUser> {
    return toSafe(await this.users.create(body, actor));
  }

  @Patch(':id')
  @RequirePermissions('user.update')
  @ApiOperation({
    summary: 'Update a user (name, role, active state, or reset password)',
  })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
    @CurrentUser() actor: JwtPayload,
  ): Promise<SafeUser> {
    return toSafe(await this.users.update(id, actor.sub, body));
  }

  @Post(':id/unlock')
  @RequirePermissions('user.update')
  @ApiOperation({
    summary: "Clear the brute-force lockout on a user's account",
    description:
      'Resets failedLoginCount + lockedUntil without rotating the password. Available to super-admin (cross-tenant) and merchant-admin (within their merchant only).',
  })
  async unlock(@Param('id') id: string): Promise<SafeUser> {
    return toSafe(await this.users.unlock(id));
  }
}
