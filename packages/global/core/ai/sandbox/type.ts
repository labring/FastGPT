import z from 'zod';
import { SandboxUnavailableReasonEnum } from './constants';

export const SandboxUnavailableReasonSchema = z.enum(SandboxUnavailableReasonEnum);
export type SandboxUnavailableReason = z.infer<typeof SandboxUnavailableReasonSchema>;

export const SandboxImageConfigSchema = z.object({
  repository: z.string(),
  tag: z.string().optional()
});
export type SandboxImageConfigType = z.infer<typeof SandboxImageConfigSchema>;

export const SandboxRuntimeStatusSchema = z.enum(['readyToInit', 'upgradeRequired', 'upgrading']);
export const SandboxRuntimeStatusResponseSchema = z.object({
  status: SandboxRuntimeStatusSchema.meta({
    example: 'upgradeRequired',
    description: 'Sandbox runtime image upgrade status'
  }),
  lastError: z.string().optional().meta({
    example: 'Failed to archive sandbox',
    description: 'Most recent runtime upgrade failure'
  })
});
export type SandboxRuntimeStatusResponse = z.infer<typeof SandboxRuntimeStatusResponseSchema>;
