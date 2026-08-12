import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

// All roles that can be assigned via the API
// SUPER_ADMIN is now assignable (only by existing SUPER_ADMIN)
export const ASSIGNABLE_ROLES = [
  'SUPER_ADMIN',
  'MERCHANT_ADMIN',
  'ACCOUNTANT',
  'STORE_KEEPER',
  'CASHIER',
  'SUPPORT',
] as const;

// Roles that can be assigned by non-SUPER_ADMIN users
export const REGULAR_ROLES = [
  'MERCHANT_ADMIN',
  'ACCOUNTANT',
  'STORE_KEEPER',
  'CASHIER',
  'SUPPORT',
] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];
export type RegularRole = (typeof REGULAR_ROLES)[number];

export class CreateUserDto {
  @ApiProperty({ example: 'cashier@e-pay.et' })
  @IsEmail()
  @MaxLength(254) // RFC 5321 email cap.
  email!: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ example: 'Hana Tadesse' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiProperty({
    enum: ASSIGNABLE_ROLES,
    example: 'CASHIER',
    description: 'SUPER_ADMIN can only be created by an existing SUPER_ADMIN',
  })
  @IsIn(ASSIGNABLE_ROLES)
  role!: AssignableRole;

  /**
   * Merchant the new user belongs to. Required when SUPER_ADMIN provisions
   * users into a specific tenant; omitted when a merchant admin creates one
   * (defaults to their own merchant). Must equal the caller's merchant for
   * non-super-admin actors — enforced server-side.
   */
  @ApiPropertyOptional({
    description:
      'Merchant id — super-admin can target any merchant; merchant admins always create within their own merchant.',
  })
  @IsOptional()
  @IsString()
  merchantId?: string;

  /**
   * Multi-branch access grant for CASHIER / ACCOUNTANT / SUPPORT. Each id
   * becomes a UserBranch row so the user can switch between them via the
   * branch switcher. Ignored for MERCHANT_ADMIN (implicit access to every
   * branch of the merchant). Empty array = no branch access (user can sign
   * in but every operational endpoint refuses until an admin grants access).
   */
  @ApiPropertyOptional({
    type: [String],
    description:
      'Branch ids this user may act as. Multiple = switchable via the branch picker. Ignored for MERCHANT_ADMIN.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  branchIds?: string[];

  /**
   * Pinned default branch — the one auto-selected on login. Must be a member
   * of branchIds (or a branch under the caller's merchant for MERCHANT_ADMIN).
   * Omitted = first entry of branchIds.
   */
  @ApiPropertyOptional({
    nullable: true,
    description:
      'Branch to auto-select for this user on login. Must be in branchIds.',
  })
  @IsOptional()
  @IsString()
  branchId?: string | null;
}
