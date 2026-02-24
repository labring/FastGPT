import type { RequireOnlyOne } from '../../common/type/utils';
import {
  type UpdateClbPermissionProps,
  UpdatePermissionBody
} from '../../support/permission/collaborator';
import { PermissionValueType } from '../../support/permission/type';

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
