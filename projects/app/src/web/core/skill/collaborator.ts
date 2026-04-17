import type {
  UpdateSkillCollaboratorBody,
  SkillCollaboratorDeleteParams
} from '@fastgpt/global/core/agentSkills/collaborator';
import { DELETE, GET, POST } from '@/web/common/api/request';
import type { CollaboratorListType } from '@fastgpt/global/support/permission/collaborator';

export const getSkillCollaboratorList = (skillId: string) =>
  GET<CollaboratorListType>('/proApi/core/agentSkill/collaborator/list', { skillId });

export const postUpdateSkillCollaborators = (body: UpdateSkillCollaboratorBody) =>
  POST('/proApi/core/agentSkill/collaborator/update', body);

export const deleteSkillCollaborator = (params: SkillCollaboratorDeleteParams) =>
  DELETE('/proApi/core/agentSkill/collaborator/delete', params);
