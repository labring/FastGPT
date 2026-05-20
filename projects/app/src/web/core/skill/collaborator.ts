import type {
  UpdateSkillCollaboratorBody,
  SkillCollaboratorDeleteParams
} from '@fastgpt/global/core/ai/skill/collaborator';
import { DELETE, GET, POST } from '@/web/common/api/request';
import type { CollaboratorListType } from '@fastgpt/global/support/permission/collaborator';

export const getSkillCollaboratorList = (skillId: string) =>
  GET<CollaboratorListType>('/proApi/core/ai/skill/collaborator/list', { skillId });

export const postUpdateSkillCollaborators = (body: UpdateSkillCollaboratorBody) =>
  POST('/proApi/core/ai/skill/collaborator/update', body);

export const deleteSkillCollaborator = (params: SkillCollaboratorDeleteParams) =>
  DELETE('/proApi/core/ai/skill/collaborator/delete', params);
