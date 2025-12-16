import { z } from 'zod';
import { AiSkillSchema, SkillToolSchema } from '../../../../core/ai/skill/type';
import { SelectedToolItemTypeSchema } from '../../../../core/app/formEdit/type';
import { ObjectIdSchema } from '../../../../common/type/mongo';

export const ListAiSkillBody = z.object({
  appId: z.string(),
  searchText: z.string().optional()
});
export type ListAiSkillBodyType = z.infer<typeof ListAiSkillBody>;
// Simplified list item schema - only id and name
export const ListAiSkillItemSchema = z.object({
  _id: ObjectIdSchema,
  name: z.string()
});
export const ListAiSkillResponseSchema = z.array(ListAiSkillItemSchema);
export type ListAiSkillResponse = z.infer<typeof ListAiSkillResponseSchema>;

export const GetAiSkillDetailQuery = z.object({
  id: z.string()
});
export type GetAiSkillDetailQueryType = z.infer<typeof GetAiSkillDetailQuery>;
// Detail response with expanded tools
export const GetAiSkillDetailResponseSchema = AiSkillSchema.omit({
  tools: true,
  teamId: true,
  tmbId: true,
  appId: true,
  createTime: true,
  updateTime: true
}).extend({
  tools: z.array(SelectedToolItemTypeSchema)
});
export type GetAiSkillDetailResponse = z.infer<typeof GetAiSkillDetailResponseSchema>;

export const UpdateAiSkillBody = z.object({
  id: z.string().optional(),
  appId: z.string(), // Required for creating new skill, optional for updating existing skill
  name: z.string().optional(),
  description: z.string().optional(),
  steps: z.string().optional(),
  tools: z.array(SkillToolSchema).optional(),
  datasets: z.array(z.any()).optional()
});
export type UpdateAiSkillBodyType = z.infer<typeof UpdateAiSkillBody>;
export const UpdateAiSkillResponseSchema = z.string();
export type UpdateAiSkillResponse = z.infer<typeof UpdateAiSkillResponseSchema>;

export const DeleteAiSkillQuery = z.object({
  id: z.string()
});
export type DeleteAiSkillQueryType = z.infer<typeof DeleteAiSkillQuery>;
export const DeleteAiSkillResponseSchema = z.object({});
export type DeleteAiSkillResponse = z.infer<typeof DeleteAiSkillResponseSchema>;
