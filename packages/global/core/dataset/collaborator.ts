import type { UpdateClbPermissionProps } from '../../support/permission/collaborator';
import type { RequireOnlyOne } from '../../common/type/utils';
import type { PermissionEffectScopeEnum } from '../../support/permission/constant';

export type UpdateDatasetCollaboratorBody = UpdateClbPermissionProps & {
  datasetId: string;
  permissionEffectScope?: PermissionEffectScopeEnum;
};

export type DatasetCollaboratorDeleteParams = {
  datasetId: string;
} & RequireOnlyOne<{
  tmbId: string;
  groupId: string;
  orgId: string;
}>;
