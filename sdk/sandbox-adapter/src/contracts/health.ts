import type { SandboxMetrics } from '../types';

/** Health and resource metrics contract. */
export type IHealthCheck = {
  ping(): Promise<boolean>;
  getMetrics(): Promise<SandboxMetrics>;
};
