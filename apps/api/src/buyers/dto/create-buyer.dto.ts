import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CreateBuyerDto {
  @ApiProperty({ example: '0999930000' })
  @IsString()
  tin!: string;

  @ApiProperty({ example: 'ABC Trading' })
  @IsString()
  legalName!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vatNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() idType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() idNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() houseNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() region?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() zone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() kebele?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() wereda?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
}
