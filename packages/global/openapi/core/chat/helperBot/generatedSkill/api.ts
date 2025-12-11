import { z } from 'zod';
import { PaginationPropsSchema } from '../../../../type';
import type { PaginationResponse } from '../../../../../../web/common/fetch/type';
import {
  GeneratedSkillStepSchema,
  type GeneratedSkillSiteType
} from '../../../../../core/chat/helperBot/generatedSkill/type';

// Save Generated Skill
export const SaveGeneratedSkillParamsSchema = z.object({
  chatId: z.string(),
  chatItemId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  goal: z.string().optional(),
  taskType: z.string().optional(),
  steps: z.array(GeneratedSkillStepSchema),
  status: z.enum(['draft', 'active', 'archived']).optional()
});
export type SaveGeneratedSkillParamsType = z.infer<typeof SaveGeneratedSkillParamsSchema>;
export const SaveGeneratedSkillResponseSchema = z.object({
  _id: z.string()
});
export type SaveGeneratedSkillResponseType = z.infer<typeof SaveGeneratedSkillResponseSchema>;

// Get Generated Skills List
export const GetGeneratedSkillsParamsSchema = z
  .object({
    searchText: z.string().optional(),
    status: z.enum(['draft', 'active', 'archived']).optional()
  })
  .and(PaginationPropsSchema);
export type GetGeneratedSkillsParamsType = z.infer<typeof GetGeneratedSkillsParamsSchema>;
export type GetGeneratedSkillsResponseType = PaginationResponse<GeneratedSkillSiteType>;

// Get Generated Skill Detail
export const GetGeneratedSkillDetailParamsSchema = z.object({
  id: z.string()
});
export type GetGeneratedSkillDetailParamsType = z.infer<typeof GetGeneratedSkillDetailParamsSchema>;

// Update Generated Skill
export const UpdateGeneratedSkillParamsSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  goal: z.string().optional(),
  taskType: z.string().optional(),
  steps: z.array(GeneratedSkillStepSchema).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional()
});
export type UpdateGeneratedSkillParamsType = z.infer<typeof UpdateGeneratedSkillParamsSchema>;

// Delete Generated Skill
export const DeleteGeneratedSkillParamsSchema = z.object({
  id: z.string()
});
export type DeleteGeneratedSkillParamsType = z.infer<typeof DeleteGeneratedSkillParamsSchema>;
