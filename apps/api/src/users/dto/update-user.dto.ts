import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { ASSIGNABLE_ROLES, type AssignableRole } from './create-user.dto';

export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ enum: ASSIGNABLE_ROLES })
  @IsOptional()
  @IsIn(ASSIGNABLE_ROLES as unknown as string[])
  role?: AssignableRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    minLength: 8,
    maxLength: 128,
    description: 'Reset the password',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  // 128 char cap — see CreateUserDto.password.
  @MaxLength(128)
  password?: string;

  /**
   * Replace the user's UserBranch grants with this set. `undefined` leaves
   * grants unchanged; `[]` clears them entirely; a list replaces. Ignored
   * for MERCHANT_ADMIN (implicit access).
   */
  @ApiPropertyOptional({
    type: [String],
    description:
      'Branch ids this user may act as. Replaces existing grants. Ignored for MERCHANT_ADMIN.',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  branchIds?: string[];

  /**
   * Pinned default branch. `null` clears; `<branchId>` sets it; `undefined`
   * leaves unchanged. Must be included in branchIds (or under the caller's
   * merchant for MERCHANT_ADMIN).
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
