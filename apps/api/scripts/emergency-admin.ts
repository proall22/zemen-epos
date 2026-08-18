import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

interface DatabaseIdentity {
  database: string;
  schema: string;
  user: string;
  serverAddress: string | null;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main(): Promise<void> {
  const email = required('EMERGENCY_ADMIN_EMAIL').toLowerCase();
  const password = required('EMERGENCY_ADMIN_PASSWORD');
  const name =
    process.env.EMERGENCY_ADMIN_NAME?.trim() || 'Emergency System Admin';

  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error(
      'EMERGENCY_ADMIN_PASSWORD must be 12-72 UTF-8 bytes for bcrypt.',
    );
  }

  const [identity] = await prisma.$queryRaw<DatabaseIdentity[]>`
    SELECT current_database() AS database,
           current_schema() AS schema,
           current_user AS user,
           inet_server_addr()::text AS "serverAddress"
  `;

  console.log('Database identity:', identity);
  console.log('Emergency administrator:', email);

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.$transaction(async (tx) => {
    const row = await tx.user.upsert({
      where: { email },
      create: {
        email,
        passwordHash,
        name,
        role: 'SUPER_ADMIN',
        active: true,
        failedLoginCount: 0,
        lockedUntil: null,
        merchantId: null,
        branchId: null,
        emailVerifiedAt: new Date(),
      },
      update: {
        passwordHash,
        name,
        role: 'SUPER_ADMIN',
        active: true,
        failedLoginCount: 0,
        lockedUntil: null,
        merchantId: null,
        branchId: null,
        emailVerifiedAt: new Date(),
      },
      select: { id: true, email: true, role: true, active: true },
    });

    await tx.userBranch.deleteMany({ where: { userId: row.id } });
    await tx.refreshToken.updateMany({
      where: { userId: row.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return row;
  });

  const stored = await prisma.user.findUniqueOrThrow({
    where: { id: admin.id },
    select: { passwordHash: true },
  });
  if (!(await bcrypt.compare(password, stored.passwordHash))) {
    throw new Error('Post-write bcrypt verification failed.');
  }

  console.log(
    'Emergency administrator is active and password verified:',
    admin,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
