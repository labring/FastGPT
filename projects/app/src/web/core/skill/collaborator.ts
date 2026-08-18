import { GET, POST } from '@/web/common/api/request';
import type {
  GetSkillCollaboratorListQuery,
  GetSkillCollaboratorListResponse,
  UpdateSkillCollaboratorBody,
  UpdateSkillCollaboratorResponse
} from '@fastgpt/global/openapi/core/ai/skill/api';

export const getSkillCollaboratorList = (skillId: GetSkillCollaboratorListQuery['skillId']) =>
  GET<GetSkillCollaboratorListResponse>('/proApi/core/ai/skill/collaborator/list', { skillId });

export const postUpdateSkillCollaborators = (body: UpdateSkillCollaboratorBody) =>
  POST<UpdateSkillCollaboratorResponse>('/proApi/core/ai/skill/collaborator/update', body);
