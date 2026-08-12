import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route or controller as accessible without a valid JWT. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
