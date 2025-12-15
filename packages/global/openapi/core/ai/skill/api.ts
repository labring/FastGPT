import { z } from 'zod';
import { PaginationPropsSchema } from '../../../type';
import type { PaginationResponse } from '../../../../../web/common/fetch/type';
import { type GeneratedSkillSiteType } from '../../../../core/chat/helperBot/generatedSkill/type';

export const GetGeneratedSkillsParamsSchema = z
  .object({
    appId: z.string(),
    searchText: z.string().optional(),
    status: z.enum(['draft', 'active', 'archived']).optional()
  })
  .and(PaginationPropsSchema);
export type GetGeneratedSkillsParamsType = z.infer<typeof GetGeneratedSkillsParamsSchema>;
export type GetGeneratedSkillsResponseType = PaginationResponse<GeneratedSkillSiteType>;

export const GetGeneratedSkillDetailParamsSchema = z.object({
  id: z.string()
});
export type GetGeneratedSkillDetailParamsType = z.infer<typeof GetGeneratedSkillDetailParamsSchema>;

export const UpdateGeneratedSkillParamsSchema = z.object({
  id: z.string().optional(),
  appId: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  steps: z.string().optional(),
  status: z.enum(['draft', 'active', 'archived']).optional()
});
export type UpdateGeneratedSkillParamsType = z.infer<typeof UpdateGeneratedSkillParamsSchema>;

export const DeleteGeneratedSkillParamsSchema = z.object({
  id: z.string()
});
export type DeleteGeneratedSkillParamsType = z.infer<typeof DeleteGeneratedSkillParamsSchema>;
