import { PartialType } from '@nestjs/swagger';

import { CreateScheduledReportDto } from './create-scheduled-report.dto';

/** deliveredThrough is deliberately absent — forward skips unsent data, back
 *  re-sends. Only a confirmed delivery moves it. */
export class UpdateScheduledReportDto extends PartialType(
  CreateScheduledReportDto,
) {}
