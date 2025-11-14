import type { UpdateClbPermissionProps } from '../../support/permission/collaborator';
import { PermissionValueType } from '../../support/permission/type';
import type { RequireOnlyOne } from '../../common/type/utils';

export type UpdateDatasetCollaboratorBody = UpdateClbPermissionProps & {
  datasetId: string;
};

export type DatasetCollaboratorDeleteParams = {
  datasetId: string;
} & RequireOnlyOne<{
  tmbId: string;
  groupId: string;
  orgId: string;
}>;
