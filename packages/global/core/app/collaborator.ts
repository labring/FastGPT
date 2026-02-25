import type { RequireOnlyOne } from '../../common/type/utils';
import { type UpdateClbPermissionProps } from '../../support/permission/collaborator';

export type UpdateAppCollaboratorBody = UpdateClbPermissionProps & {
  appId: string;
};

export type AppCollaboratorDeleteParams = {
  appId: string;
} & RequireOnlyOne<{
  tmbId: string;
  groupId: string;
  orgId: string;
}>;
