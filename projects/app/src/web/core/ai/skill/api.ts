import { POST, GET, PUT, DELETE } from '@/web/common/api/request';
import type {
  ListAiSkillBodyType,
  ListAiSkillResponse,
  GetAiSkillDetailQueryType,
  UpdateAiSkillBodyType,
  UpdateAiSkillResponse,
  DeleteAiSkillQueryType,
  GetAiSkillDetailResponse
} from '@fastgpt/global/openapi/core/ai/skill/api';

export const getAiSkillList = (data: ListAiSkillBodyType) =>
  POST<ListAiSkillResponse>('/core/ai/skill/list', data);

export const getAiSkillDetail = (data: GetAiSkillDetailQueryType) =>
  GET<GetAiSkillDetailResponse>('/core/ai/skill/detail', data);

export const updateAiSkill = (data: UpdateAiSkillBodyType) =>
  PUT<UpdateAiSkillResponse>('/core/ai/skill/update', data);

export const deleteAiSkill = (data: DeleteAiSkillQueryType) =>
  DELETE('/core/ai/skill/delete', data);
