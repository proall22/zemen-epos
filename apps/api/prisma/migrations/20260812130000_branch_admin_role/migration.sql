-- A branch administrator operates one or more explicitly granted branches
-- without receiving tenant-wide merchant, credential, or user administration.
ALTER TYPE "UserRole" ADD VALUE 'BRANCH_ADMIN';
