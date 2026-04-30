import type { UpdateClbPermissionProps } from '../../support/permission/collaborator';
import type { RequireOnlyOne } from '../../common/type/utils';

export type UpdateSkillCollaboratorBody = UpdateClbPermissionProps & {
  skillId: string;
};

export type SkillCollaboratorDeleteParams = {
  skillId: string;
} & RequireOnlyOne<{
  tmbId: string;
  groupId: string;
  orgId: string;
}>;
