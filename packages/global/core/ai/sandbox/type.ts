import { SandboxUnavailableReasonEnum } from './constants';
import z from 'zod';

export const SandboxUnavailableReasonSchema = z.enum(SandboxUnavailableReasonEnum);
export type SandboxUnavailableReason = z.infer<typeof SandboxUnavailableReasonSchema>;

export type ExecuteResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  truncated?: boolean;
  durationMs?: number;
};

export const SandboxImageConfigSchema = z.object({
  repository: z.string(),
  tag: z.string().optional()
});
export type SandboxImageConfigType = z.infer<typeof SandboxImageConfigSchema>;
