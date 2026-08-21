import type { UpdateClbPermissionProps } from '../../../support/permission/collaborator';

export type UpdateSkillCollaboratorBody = UpdateClbPermissionProps & {
  skillId: string;
};
