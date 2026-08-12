export const REPORTS_QUEUE = 'scheduled-reports';
export const REPORTS_TICK_JOB_ID = 'scheduled-reports-tick';

export type ReportsJob = { kind: 'tick' } | { kind: 'run'; runId: string };
