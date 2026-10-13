import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import type { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import type { ClientSession, Model } from '../../common/mongo';
import { getResourceOwnedClbs } from './controller';
import {
  moveResourcePermissions,
  resumeResourcePermissionInheritance,
  syncResourceTreePermissions,
  updateResourceCollaborators
} from './resourcePermissionService';
import { resourcePermissionRepo } from './repository/resourcePermissionRepo';
import { calculateInheritedResourceCollaborators } from './resourcePermissionPolicy';

export type SyncChildrenPermissionResourceType = {
  _id: string;
  type: string;
  teamId: string;
  parentId?: ParentIdType;
  inheritPermission?: boolean;
};

/**
 * 兼容原有调用入口，按完整 ACL 快照同步所有继承子资源。
 * 新的父级权限更新必须传入 old/new 快照，避免父级删除后无法推导旧继承位。
 */
export async function syncChildrenPermission({
  resource,
  resourceType,
  resourceModel,
  session,
  collaborators,
  oldParentCollaborators,
  newParentCollaborators
}: {
  resource: SyncChildrenPermissionResourceType;
  folderTypeList?: string[];
  resourceModel: Model<any>;
  resourceType: PerResourceTypeEnum;
  session: ClientSession;
  collaborators?: CollaboratorItemType[];
  oldParentCollaborators?: CollaboratorItemType[];
  newParentCollaborators?: CollaboratorItemType[];
}) {
  const oldCollaborators =
    oldParentCollaborators ??
    (await getResourceOwnedClbs({
      resourceId: resource._id,
      teamId: resource.teamId,
      resourceType,
      session
    }));
  const newCollaborators = newParentCollaborators ?? collaborators ?? oldCollaborators;

  return syncResourceTreePermissions({
    resource,
    resourceModel,
    resourceType,
    oldParentCollaborators: oldCollaborators,
    newParentCollaborators: newCollaborators,
    session
  });
}

/**
 * 移动资源时重算资源自身 ACL。
 * `oldParentCollaborators` 由调用方在更新 parentId 前传入，供旧继承位计算使用。
 */
export async function syncCollaborators({
  resourceType,
  teamId,
  resourceId,
  collaborators,
  oldParentCollaborators,
  session
}: {
  resourceType: PerResourceTypeEnum;
  teamId: string;
  resourceId: string;
  collaborators: CollaboratorItemType[];
  oldParentCollaborators: CollaboratorItemType[];
  session: ClientSession;
}) {
  const oldResourceCollaborators = await resourcePermissionRepo.findByResource({
    teamId,
    resourceType,
    resourceId,
    session
  });
  const newResourceCollaborators = calculateInheritedResourceCollaborators({
    oldParentCollaborators,
    newParentCollaborators: collaborators,
    childCollaborators: oldResourceCollaborators
  });

  await resourcePermissionRepo.replaceResource({
    teamId,
    resourceType,
    resourceId,
    collaborators: newResourceCollaborators,
    session
  });
  return newResourceCollaborators;
}

/** 恢复资源继承并同步完整子树。 */
export async function resumeInheritPermission({
  resource,
  resourceModel,
  resourceType,
  session
}: {
  resource: SyncChildrenPermissionResourceType;
  folderTypeList?: string[];
  resourceType: PerResourceTypeEnum;
  resourceModel: Model<any>;
  session?: ClientSession;
}) {
  return resumeResourcePermissionInheritance({
    resource,
    resourceModel,
    resourceType,
    session
  });
}

export { moveResourcePermissions, updateResourceCollaborators };
