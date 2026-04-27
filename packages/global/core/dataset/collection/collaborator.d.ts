import type { UpdateClbPermissionProps } from '../../../support/permission/collaborator';
import type { PermissionEffectScopeEnum } from '../../../support/permission/constant';
import type { RequireOnlyOne } from '../../../common/type/utils';

export type UpdateCollectionCollaboratorBody = UpdateClbPermissionProps & {
  collectionId: string;
  permissionEffectScope?: PermissionEffectScopeEnum;
};

export type BatchUpdateCollectionCollaboratorBody = UpdateClbPermissionProps & {
  collectionIds: string[];
  permissionEffectScope?: PermissionEffectScopeEnum;
};

export type CollectionCollaboratorDeleteParams = {
  collectionId: string;
} & RequireOnlyOne<{
  tmbId: string;
  groupId: string;
  orgId: string;
}>;
