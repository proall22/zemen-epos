/** Stable BullMQ queue name. */
export const DRAFTS_SYNC_QUEUE = 'drafts-sync';

/** Stable job id for the repeatable tick. Using a fixed id makes the
 *  schedule idempotent across API restarts and multi-replica deploys —
 *  Bull dedups on (jobId, repeat-key). */
export const DRAFTS_SYNC_TICK_JOB_ID = 'drafts-sync-tick';

/** How often the worker wakes up to look for drafts to sync. */
export const DRAFTS_SYNC_TICK_MS = 30_000;

/** Min wait before re-attempting a SYNC_FAILED draft. Prevents the
 *  worker from hammering MoR with a draft whose payload is malformed
 *  (which would fail every 30s otherwise). Operator can still retry
 *  manually via the invoices page. */
export const DRAFTS_SYNC_FAILURE_BACKOFF_MS = 5 * 60_000;

/** Cap on drafts processed per tick. Sized so a backlog of e.g. 200
 *  drafts drains over a few ticks rather than hammering MoR in one
 *  burst. */
export const DRAFTS_SYNC_BATCH_SIZE = 25;
