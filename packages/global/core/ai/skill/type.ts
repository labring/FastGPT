import z from 'zod';

export const SkillToolSchema = z.object({
  id: z.string(),
  config: z.record(z.string(), z.any())
});
export type SkillToolType = z.infer<typeof SkillToolSchema>;
