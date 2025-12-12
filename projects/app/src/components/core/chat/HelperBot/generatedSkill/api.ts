import { POST, GET, PUT, DELETE } from '@/web/common/api/request';
import type {
  SaveGeneratedSkillParamsType,
  SaveGeneratedSkillResponseType,
  GetGeneratedSkillsParamsType,
  GetGeneratedSkillsResponseType,
  GetGeneratedSkillDetailParamsType,
  UpdateGeneratedSkillParamsType,
  DeleteGeneratedSkillParamsType
} from '@fastgpt/global/openapi/core/chat/helperBot/generatedSkill/api';
import type { GeneratedSkillSiteType } from '@fastgpt/global/core/chat/helperBot/generatedSkill/type';

export const saveGeneratedSkill = (data: SaveGeneratedSkillParamsType) =>
  POST<SaveGeneratedSkillResponseType>('/core/chat/helperBot/generatedSkill/save', data);

export const getGeneratedSkillList = (data: GetGeneratedSkillsParamsType) =>
  POST<GetGeneratedSkillsResponseType>('/core/chat/helperBot/generatedSkill/list', data);

export const getGeneratedSkillDetail = (data: GetGeneratedSkillDetailParamsType) =>
  GET<GeneratedSkillSiteType>('/core/chat/helperBot/generatedSkill/detail', data);

export const updateGeneratedSkill = (data: UpdateGeneratedSkillParamsType) =>
  PUT<{ success: boolean }>('/core/chat/helperBot/generatedSkill/update', data);

export const deleteGeneratedSkill = (data: DeleteGeneratedSkillParamsType) =>
  DELETE<{ success: boolean }>('/core/chat/helperBot/generatedSkill/delete', data);
