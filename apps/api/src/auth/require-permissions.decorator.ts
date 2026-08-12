import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Mark a route or controller with the permission codes the caller must hold.
 * Codes are AND'd: the request only proceeds when the user has every code.
 */
export const RequirePermissions = (...codes: string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, codes);
