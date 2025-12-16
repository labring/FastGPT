import { ObjectIdSchema } from '../../../common/type/mongo';
import z from 'zod';

export const SkillToolSchema = z.object({
  id: z.string(),
  config: z.record(z.string(), z.any())
});
export type SkillToolType = z.infer<typeof SkillToolSchema>;

export const AiSkillSchema = z.object({
  _id: ObjectIdSchema,
  teamId: ObjectIdSchema,
  tmbId: ObjectIdSchema,
  appId: ObjectIdSchema,
  createTime: z.date(),
  updateTime: z.date(),
  name: z.string(),
  description: z.string().optional(),
  steps: z.string().default(''),
  tools: z.array(SkillToolSchema),
  datasets: z.array(z.any())
});
export type AiSkillSchemaType = z.infer<typeof AiSkillSchema>;
