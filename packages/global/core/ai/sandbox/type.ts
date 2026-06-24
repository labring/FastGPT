import z from 'zod';

export const SandboxImageConfigSchema = z.object({
  repository: z.string(),
  tag: z.string().optional()
});
export type SandboxImageConfigType = z.infer<typeof SandboxImageConfigSchema>;
