/** Public, SLA-facing component state. Deliberately coarse — the status page
 *  is unauthenticated, so it never carries internal error detail. */
export type ComponentState = 'operational' | 'degraded' | 'down';

export interface ComponentStatus {
  /** Stable slug used in the per-component route (`/status/:key`). */
  key: string;
  name: string;
  description: string;
  state: ComponentState;
  /** Round-trip latency of the backing probe, when measured (an SLA metric —
   *  safe to expose; the internal component behind it is not named). */
  latencyMs?: number;
}

export interface StatusReport {
  /** Worst-of the components below. */
  status: ComponentState;
  updatedAt: string;
  components: ComponentStatus[];
}
