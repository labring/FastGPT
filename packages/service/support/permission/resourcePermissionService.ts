import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import {
  OwnerRoleVal,
  type PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import type { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import { mongoSessionRun } from '../../common/mongo/sessionRun';
import type { ClientSession, Model } from '../../common/mongo';
import type { SyncChildrenPermissionResourceType } from './inheritPermission';
import { resourcePermissionRepo } from './repository/resourcePermissionRepo';
import {
  calculateInheritedResourceCollaborators,
  mergeResourceCollaborators,
  shouldInheritResourcePermission
} from './resourcePermissionPolicy';

type ResourceModel = Model<any>;

/** 读取团队内某类资源的完整 ACL，供列表和运行时工具复用。 */
export const getResourcePermissionsByTeam = resourcePermissionRepo.findByTeam;

/** 创建资源的完整 ACL：父级快照作为继承部分，创建者作为子级 owner。 */
export const createResourcePermissions = async ({
  resource,
  resourceType,
  tmbId,
  session
}: {
  resource: SyncChildrenPermissionResourceType;
  resourceType: PerResourceTypeEnum;
  tmbId: string;
  session: ClientSession;
}) => {
  const parentCollaborators =
    resource.parentId && shouldInheritResourcePermission(resource.inheritPermission)
      ? await resourcePermissionRepo.findByResource({
          teamId: resource.teamId,
          resourceType,
          resourceId: String(resource.parentId),
          session
        })
      : [];

  const collaborators = mergeResourceCollaborators({
    parentCollaborators,
    childCollaborators: [{ tmbId, permission: OwnerRoleVal }]
  });

  await resourcePermissionRepo.replaceResource({
    teamId: resource.teamId,
    resourceType,
    resourceId: String(resource._id),
    collaborators,
    session
  });
};

/**
 * 按资源树传播父级 ACL。只处理启用继承的分支，
 * 这样取消继承的节点及其独立子树都不会被父级更新覆盖。
 */
export const syncResourceTreePermissions = async ({
  resource,
  resourceModel,
  resourceType,
  oldParentCollaborators,
  newParentCollaborators,
  session
}: {
  resource: SyncChildrenPermissionResourceType;
  resourceModel: ResourceModel;
  resourceType: PerResourceTypeEnum;
  oldParentCollaborators: CollaboratorItemType[];
  newParentCollaborators: CollaboratorItemType[];
  session: ClientSession;
}) => {
  const nodes = await resourceModel
    .find({ teamId: resource.teamId }, '_id parentId inheritPermission')
    .lean<SyncChildrenPermissionResourceType[]>()
    .session(session);
  const childrenByParent = new Map<string, SyncChildrenPermissionResourceType[]>();

  for (const node of nodes) {
    if (!node.parentId) continue;
    const children = childrenByParent.get(String(node.parentId)) ?? [];
    children.push(node);
    childrenByParent.set(String(node.parentId), children);
  }

  const allDescendantIds: string[] = [];
  const pendingIds = [String(resource._id)];
  while (pendingIds.length > 0) {
    const parentId = pendingIds.shift()!;
    for (const child of childrenByParent.get(parentId) ?? []) {
      if (!shouldInheritResourcePermission(child.inheritPermission)) continue;
      allDescendantIds.push(String(child._id));
      pendingIds.push(String(child._id));
    }
  }

  if (allDescendantIds.length === 0) return;

  const permissionRows = await resourcePermissionRepo.findByResourceIds({
    teamId: resource.teamId,
    resourceType,
    resourceIds: allDescendantIds,
    session
  });
  const permissionsByResource = new Map<string, CollaboratorItemType[]>();
  for (const row of permissionRows) {
    const rows = permissionsByResource.get(String(row.resourceId)) ?? [];
    rows.push(row);
    permissionsByResource.set(String(row.resourceId), rows);
  }

  const pending = [
    {
      parentId: String(resource._id),
      oldCollaborators: oldParentCollaborators,
      newCollaborators: newParentCollaborators
    }
  ];

  while (pending.length > 0) {
    const parent = pending.shift()!;
    for (const child of childrenByParent.get(parent.parentId) ?? []) {
      if (!shouldInheritResourcePermission(child.inheritPermission)) continue;

      const childId = String(child._id);
      const oldChildCollaborators = permissionsByResource.get(childId) ?? [];
      const newChildCollaborators = calculateInheritedResourceCollaborators({
        oldParentCollaborators: parent.oldCollaborators,
        newParentCollaborators: parent.newCollaborators,
        childCollaborators: oldChildCollaborators
      });

      await resourcePermissionRepo.replaceResource({
        teamId: resource.teamId,
        resourceType,
        resourceId: childId,
        collaborators: newChildCollaborators,
        session
      });

      pending.push({
        parentId: childId,
        oldCollaborators: oldChildCollaborators,
        newCollaborators: newChildCollaborators
      });
    }
  }
};

/**
 * 更新一个资源自身 ACL，并以 old/new 快照传播到所有继承子资源。
 * 调用方必须在写入父级 ACL 前取得 oldCollaborators。
 */
export const updateResourceCollaborators = async ({
  resource,
  resourceModel,
  resourceType,
  oldCollaborators,
  newCollaborators,
  session
}: {
  resource: SyncChildrenPermissionResourceType;
  resourceModel: ResourceModel;
  resourceType: PerResourceTypeEnum;
  oldCollaborators: CollaboratorItemType[];
  newCollaborators: CollaboratorItemType[];
  session: ClientSession;
}) => {
  await resourcePermissionRepo.replaceResource({
    teamId: resource.teamId,
    resourceType,
    resourceId: String(resource._id),
    collaborators: newCollaborators,
    session
  });
  await syncResourceTreePermissions({
    resource,
    resourceModel,
    resourceType,
    oldParentCollaborators: oldCollaborators,
    newParentCollaborators: newCollaborators,
    session
  });
};

/** 移动资源时替换资源自身 ACL，并按新快照同步继承子树。 */
export const moveResourcePermissions = async ({
  resource,
  newParentId,
  resourceModel,
  resourceType,
  newParentCollaborators,
  session
}: {
  resource: SyncChildrenPermissionResourceType;
  newParentId?: ParentIdType;
  resourceModel: ResourceModel;
  resourceType: PerResourceTypeEnum;
  newParentCollaborators: CollaboratorItemType[];
  session: ClientSession;
}) => {
  const [oldParentCollaborators, oldResourceCollaborators] = await Promise.all([
    resource.parentId
      ? resourcePermissionRepo.findByResource({
          teamId: resource.teamId,
          resourceType,
          resourceId: String(resource.parentId),
          session
        })
      : [],
    resourcePermissionRepo.findByResource({
      teamId: resource.teamId,
      resourceType,
      resourceId: String(resource._id),
      session
    })
  ]);
  const newResourceCollaborators = calculateInheritedResourceCollaborators({
    oldParentCollaborators,
    newParentCollaborators,
    childCollaborators: oldResourceCollaborators
  });

  await resourcePermissionRepo.replaceResource({
    teamId: resource.teamId,
    resourceType,
    resourceId: String(resource._id),
    collaborators: newResourceCollaborators,
    session
  });

  await syncResourceTreePermissions({
    resource,
    resourceModel,
    resourceType,
    oldParentCollaborators: oldResourceCollaborators,
    newParentCollaborators: newResourceCollaborators,
    session
  });

  return { newParentId, collaborators: newResourceCollaborators };
};

/** 恢复继承时保留相对当前父级独有的权限位，并同步整个子树。 */
export const resumeResourcePermissionInheritance = async ({
  resource,
  resourceModel,
  resourceType,
  session
}: {
  resource: SyncChildrenPermissionResourceType;
  resourceModel: ResourceModel;
  resourceType: PerResourceTypeEnum;
  session?: ClientSession;
}) => {
  const fn = async (activeSession: ClientSession) => {
    const parentCollaborators = resource.parentId
      ? await resourcePermissionRepo.findByResource({
          teamId: resource.teamId,
          resourceType,
          resourceId: String(resource.parentId),
          session: activeSession
        })
      : [];
    const oldResourceCollaborators = await resourcePermissionRepo.findByResource({
      teamId: resource.teamId,
      resourceType,
      resourceId: String(resource._id),
      session: activeSession
    });
    const newResourceCollaborators = calculateInheritedResourceCollaborators({
      oldParentCollaborators: parentCollaborators,
      newParentCollaborators: parentCollaborators,
      childCollaborators: oldResourceCollaborators
    });

    await resourcePermissionRepo.replaceResource({
      teamId: resource.teamId,
      resourceType,
      resourceId: String(resource._id),
      collaborators: newResourceCollaborators,
      session: activeSession
    });
    await syncResourceTreePermissions({
      resource,
      resourceModel,
      resourceType,
      oldParentCollaborators: oldResourceCollaborators,
      newParentCollaborators: newResourceCollaborators,
      session: activeSession
    });
    await resourceModel.updateOne(
      { _id: resource._id },
      { inheritPermission: true },
      { session: activeSession }
    );
  };

  return session ? fn(session) : mongoSessionRun(fn);
};
