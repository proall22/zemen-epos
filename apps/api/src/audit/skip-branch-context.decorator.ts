import { SetMetadata } from '@nestjs/common';

export const SKIP_BRANCH_CONTEXT_KEY = 'skipBranchContext';

/** Marks a bootstrap route that must stay reachable even when the caller sends
 *  a branch header they can't act as — otherwise a stale header locks the SPA
 *  out of the very endpoint that would correct it. */
export const SkipBranchContext = () =>
  SetMetadata(SKIP_BRANCH_CONTEXT_KEY, true);
