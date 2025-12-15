import { POST, GET, PUT, DELETE } from '@/web/common/api/request';
import type {
  GetGeneratedSkillsParamsType,
  GetGeneratedSkillsResponseType,
  GetGeneratedSkillDetailParamsType,
  UpdateGeneratedSkillParamsType,
  DeleteGeneratedSkillParamsType
} from '@fastgpt/global/openapi/core/ai/skill/api';
import type { GeneratedSkillSiteType } from '@fastgpt/global/core/chat/helperBot/generatedSkill/type';

export const updateGeneratedSkill = (data: UpdateGeneratedSkillParamsType) =>
  PUT<{ success: boolean; _id: string }>('/core/ai/skill/update', data);

export const getGeneratedSkillList = (data: GetGeneratedSkillsParamsType) =>
  POST<GetGeneratedSkillsResponseType>('/core/ai/skill/list', data);

export const getGeneratedSkillDetail = (data: GetGeneratedSkillDetailParamsType) =>
  GET<GeneratedSkillSiteType>('/core/ai/skill/detail', data);

export const deleteGeneratedSkill = (data: DeleteGeneratedSkillParamsType) =>
  DELETE<{ success: boolean }>('/core/ai/skill/delete', data);
