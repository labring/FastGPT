import { POST, GET, PUT, DELETE } from '@/web/common/api/request';
import type {
  ListAiSkillBodyType,
  ListAiSkillResponse,
  GetAiSkillDetailQueryType,
  UpdateAiSkillBodyType,
  DeleteAiSkillQueryType
} from '@fastgpt/global/openapi/core/ai/skill/api';
import type { AiSkillSchemaType } from '@fastgpt/global/core/ai/skill/type';

export const updateAiSkill = (data: UpdateAiSkillBodyType) =>
  PUT<{ success: boolean; _id: string }>('/core/ai/skill/update', data);

export const getAiSkillList = (data: ListAiSkillBodyType) =>
  POST<ListAiSkillResponse>('/core/ai/skill/list', data);

export const getAiSkillDetail = (data: GetAiSkillDetailQueryType) =>
  GET<AiSkillSchemaType>('/core/ai/skill/detail', data);

export const deleteAiSkill = (data: DeleteAiSkillQueryType) =>
  DELETE<{ success: boolean }>('/core/ai/skill/delete', data);
