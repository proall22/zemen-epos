import { PartialType } from '@nestjs/swagger';

import { CreateHarmonizationCodeDto } from './create-harmonization-code.dto';

export class UpdateHarmonizationCodeDto extends PartialType(
  CreateHarmonizationCodeDto,
) {}
