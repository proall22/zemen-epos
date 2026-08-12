import { OmitType, PartialType } from '@nestjs/swagger';

import { CreateStoreDto } from './create-store.dto';

/**
 * Update never allows moving a store to a different branch — that's a
 * different concept (would orphan the `inventory_stocks` rows) and a
 * merchant with that need should just create a new store and transfer.
 */
export class UpdateStoreDto extends PartialType(
  OmitType(CreateStoreDto, ['branchId'] as const),
) {}
