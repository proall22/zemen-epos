import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

// Use the same DATABASE_URL as the API. Never embed a second datasource here:
// doing so can update a different Neon project/branch and exposes credentials.
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required.');
}
const prisma = new PrismaClient();

// All users and their passwords
const USERS = [
  { email: 'admin@eirxmsepay.com', password: 'SuperAdmin@2026!' },
  { email: 'merchant@eirxmsepay.com', password: 'MerchantAdmin@2026!' },
  { email: 'admin.main@eirxmsepay.com', password: 'BranchAdmin@2026!' },
  { email: 'admin.bole@eirxmsepay.com', password: 'BranchAdmin@2026!' },
  { email: 'admin.piassa@eirxmsepay.com', password: 'BranchAdmin@2026!' },
  { email: 'acc.main@eirxmsepay.com', password: 'Accountant@2026!' },
  { email: 'acc.bole@eirxmsepay.com', password: 'Accountant@2026!' },
  { email: 'acc.piassa@eirxmsepay.com', password: 'Accountant@2026!' },
  { email: 'store.main@eirxmsepay.com', password: 'StoreKeeper@2026!' },
  { email: 'store.bole@eirxmsepay.com', password: 'StoreKeeper@2026!' },
  { email: 'store.piassa@eirxmsepay.com', password: 'StoreKeeper@2026!' },
  { email: 'cashier1.main@eirxmsepay.com', password: 'Cashier@2026!' },
  { email: 'cashier2.main@eirxmsepay.com', password: 'Cashier@2026!' },
  { email: 'cashier1.bole@eirxmsepay.com', password: 'Cashier@2026!' },
  { email: 'cashier2.bole@eirxmsepay.com', password: 'Cashier@2026!' },
  { email: 'cashier1.piassa@eirxmsepay.com', password: 'Cashier@2026!' },
  { email: 'cashier2.piassa@eirxmsepay.com', password: 'Cashier@2026!' },
  { email: 'support.main@eirxmsepay.com', password: 'Support@2026!' },
  { email: 'support.bole@eirxmsepay.com', password: 'Support@2026!' },
  { email: 'support.piassa@eirxmsepay.com', password: 'Support@2026!' },
];

async function updatePasswords() {
  console.log('='.repeat(70));
  console.log('🔐 EIRMS × Zemen-ePos Password Hash Generator');
  console.log('='.repeat(70));
  console.log('📡 Connecting to database...');

  try {
    // Test connection
    await prisma.$connect();
    console.log('✅ Connected to database successfully!\n');

    let updatedCount = 0;
    let notFoundCount = 0;

    for (const user of USERS) {
      // Generate bcrypt hash with 10 rounds
      const hash = bcrypt.hashSync(user.password, 10);

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { email: user.email },
      });

      if (!existingUser) {
        console.log(`❌ User not found: ${user.email}`);
        notFoundCount++;
        continue;
      }

      // Update the user
      await prisma.user.update({
        where: { email: user.email },
        data: { passwordHash: hash },
      });

      console.log(`✅ Updated: ${user.email}`);
      updatedCount++;
    }

    console.log('-'.repeat(50));
    console.log(`✅ Updated ${updatedCount} users successfully!`);
    if (notFoundCount > 0) {
      console.log(`⚠️  ${notFoundCount} users not found in database`);
    }

    // Verify sample passwords
    console.log('\n🔍 Verifying sample passwords...');
    const sampleUsers = [
      { email: 'admin@eirxmsepay.com', password: 'SuperAdmin@2026!' },
      { email: 'merchant@eirxmsepay.com', password: 'MerchantAdmin@2026!' },
      { email: 'cashier1.main@eirxmsepay.com', password: 'Cashier@2026!' },
    ];

    for (const sample of sampleUsers) {
      const dbUser = await prisma.user.findUnique({
        where: { email: sample.email },
      });

      if (dbUser) {
        const isValid = bcrypt.compareSync(
          sample.password,
          dbUser.passwordHash,
        );
        console.log(
          `${isValid ? '✅' : '❌'} ${sample.email}: ${isValid ? 'Valid' : 'Invalid'}`,
        );
      }
    }

    // Generate credential report
    console.log('\n' + '='.repeat(70));
    console.log('📋 USER CREDENTIALS SUMMARY');
    console.log('='.repeat(70));
    console.log(
      `\n${'ROLE'.padEnd(20)} ${'EMAIL'.padEnd(35)} ${'PASSWORD'.padEnd(20)}`,
    );
    console.log('-'.repeat(70));

    for (const user of USERS) {
      let role = 'UNKNOWN';
      if (user.email === 'admin@eirxmsepay.com') role = 'SUPER_ADMIN';
      else if (user.email === 'merchant@eirxmsepay.com')
        role = 'MERCHANT_ADMIN';
      else if (user.email.includes('admin.')) role = 'BRANCH_ADMIN';
      else if (user.email.includes('acc.')) role = 'ACCOUNTANT';
      else if (user.email.includes('store.')) role = 'STORE_KEEPER';
      else if (user.email.includes('cashier')) role = 'CASHIER';
      else if (user.email.includes('support')) role = 'SUPPORT';

      console.log(
        `${role.padEnd(20)} ${user.email.padEnd(35)} ${user.password.padEnd(20)}`,
      );
    }
    console.log('-'.repeat(70));

    // Generate SQL for backup
    console.log('\n' + '='.repeat(70));
    console.log('📝 SQL Update Script (Backup):');
    console.log('='.repeat(70));
    console.log('\n-- Copy and run in Neon SQL Editor if needed:\n');

    for (const user of USERS) {
      const hash = bcrypt.hashSync(user.password, 10);
      console.log(
        `UPDATE users SET "passwordHash" = '${hash}' WHERE email = '${user.email}';`,
      );
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ Process completed successfully!');
    console.log('📝 You can now log in with the provided credentials.');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the function
void updatePasswords();
