import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { OwnerRoleVal, PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import type {
  CollaboratorIdType,
  CollaboratorItemType
} from '@fastgpt/global/support/permission/collaborator';
import { mongoSessionRun } from '../../common/mongo/sessionRun';
import type { ClientSession, Model } from '../../common/mongo';
import type { SyncChildrenPermissionResourceType } from './inheritPermission';
import {
  resourcePermissionRepo,
  type ResourcePermissionPatch
} from './repository/resourcePermissionRepo';
import {
  createInheritedResourceCollaboratorCalculator,
  calculateInheritedResourceCollaborators,
  mergeResourceCollaborators,
  shouldInheritResourcePermission,
  toInheritedCollaborators
} from './resourcePermissionPolicy';
import {
  checkRoleUpdateConflict,
  getCollaboratorId
} from '@fastgpt/global/support/permission/utils';

type ResourceModel = Model<any>;

/** 读取团队内某类资源的完整 ACL，供列表和运行时工具复用。 */
export const getResourcePermissionsByTeam = resourcePermissionRepo.findByTeam;

/** 查询成员拥有指定有效权限的资源标识，支持 resourceId 和 resourceName 两类资源。 */
export const findResourceKeysByCollaboratorsPermission =
  resourcePermissionRepo.findResourceKeysByCollaboratorsPermission;

/** 替换团队 ACL，兼容历史团队行的 resourceId 缺失或为 null。 */
export const replaceTeamCollaborators = async ({
  teamId,
  collaborators,
  session
}: {
  teamId: string;
  collaborators: CollaboratorItemType[];
  session?: ClientSession;
}) => {
  const fn = (activeSession: ClientSession) =>
    resourcePermissionRepo.replaceTeam({ teamId, collaborators, session: activeSession });
  return session ? fn(session) : mongoSessionRun(fn);
};

/** 更新团队中的单个成员、组织或用户组权限。 */
export const updateTeamCollaborator = async ({
  teamId,
  collaborator,
  permission,
  session
}: {
  teamId: string;
  collaborator: CollaboratorIdType;
  permission: number;
  session?: ClientSession;
}) => {
  const fn = (activeSession: ClientSession) =>
    resourcePermissionRepo.updateCollaborator({
      teamId,
      resourceType: PerResourceTypeEnum.team,
      collaborator,
      permission,
      session: activeSession
    });
  return session ? fn(session) : mongoSessionRun(fn);
};

/** 为多个资源授予同一协作者权限，常用于 owner 转移后的资源补权。 */
export const grantCollaboratorOnResources = async (props: {
  teamId: string;
  resourceTypes: PerResourceTypeEnum[];
  resourceIds: string[];
  collaborator: CollaboratorIdType;
  permission: number;
  session?: ClientSession;
}) => {
  const fn = (activeSession: ClientSession) =>
    resourcePermissionRepo.grantCollaboratorOnResources({ ...props, session: activeSession });
  return props.session ? fn(props.session) : mongoSessionRun(fn);
};

/** 删除成员、组织或用户组在团队及资源上的 ACL。 */
export const deleteCollaboratorPermissions = async ({
  teamId,
  collaborator,
  resourceType,
  session
}: {
  teamId?: string;
  collaborator: CollaboratorIdType;
  resourceType?: PerResourceTypeEnum | PerResourceTypeEnum[];
  session?: ClientSession;
}) => {
  const fn = (activeSession: ClientSession) =>
    resourcePermissionRepo.deleteCollaborator({
      teamId,
      collaborator,
      resourceType,
      session: activeSession
    });
  return session ? fn(session) : mongoSessionRun(fn);
};

/** 转移成员 ACL，同一资源已有目标成员时按位合并权限位。 */
export const transferTmbPermissions = async (props: {
  teamId: string;
  oldTmbId: string;
  newTmbId: string;
  resourceType?: PerResourceTypeEnum | PerResourceTypeEnum[];
  resourceIds?: string[];
  session?: ClientSession;
}) => {
  const fn = (activeSession: ClientSession) =>
    resourcePermissionRepo.transferTmbPermissions({ ...props, session: activeSession });
  return props.session ? fn(props.session) : mongoSessionRun(fn);
};

/** 根据组织同步结果迁移 ACL，目标组织冲突时按位合并权限位。 */
export const migrateOrgPermissions = async (props: {
  teamId: string;
  orgIdMap: Map<string, string | undefined>;
  session?: ClientSession;
}) => {
  const fn = (activeSession: ClientSession) =>
    resourcePermissionRepo.migrateOrgPermissions({ ...props, session: activeSession });
  return props.session ? fn(props.session) : mongoSessionRun(fn);
};

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
  const oldInheritedCollaborators = toInheritedCollaborators(oldParentCollaborators);
  const newInheritedCollaborators = toInheritedCollaborators(newParentCollaborators);
  const parentCollaboratorsById = new Map(
    [...oldInheritedCollaborators, ...newInheritedCollaborators].map((collaborator) => [
      getCollaboratorId(collaborator),
      collaborator
    ])
  );
  const oldParentPermissions = new Map(
    oldInheritedCollaborators.map((collaborator) => [
      getCollaboratorId(collaborator),
      collaborator.permission
    ])
  );
  const newParentPermissions = new Map(
    newInheritedCollaborators.map((collaborator) => [
      getCollaboratorId(collaborator),
      collaborator.permission
    ])
  );
  const affectedCollaborators = Array.from(parentCollaboratorsById.values()).filter(
    (collaborator) => {
      const collaboratorId = getCollaboratorId(collaborator);
      return oldParentPermissions.get(collaboratorId) !== newParentPermissions.get(collaboratorId);
    }
  );
  const affectedCollaboratorIds = affectedCollaborators.map(
    ({ permission: _, ...collaborator }) => collaborator
  );
  const affectedCollaboratorIdSet = new Set(affectedCollaborators.map(getCollaboratorId));
  const oldAffectedParentCollaborators = oldParentCollaborators.filter((collaborator) =>
    affectedCollaboratorIdSet.has(getCollaboratorId(collaborator))
  );
  const newAffectedParentCollaborators = newParentCollaborators.filter((collaborator) =>
    affectedCollaboratorIdSet.has(getCollaboratorId(collaborator))
  );

  if (affectedCollaborators.length === 0) {
    return;
  }

  const allDescendantIds: string[] = [];
  const descendantNodes: SyncChildrenPermissionResourceType[] = [];
  let pendingParentIds = [String(resource._id)];

  // 按层查询资源树，每次只查询当前 frontier 的直接子资源，避免加载整个团队资源。
  while (pendingParentIds.length > 0) {
    const children = await resourceModel
      .find(
        { teamId: resource.teamId, parentId: { $in: pendingParentIds } },
        '_id parentId inheritPermission'
      )
      .lean<SyncChildrenPermissionResourceType[]>()
      .session(session);
    const inheritingChildren = children.filter((child) =>
      shouldInheritResourcePermission(child.inheritPermission)
    );

    descendantNodes.push(...inheritingChildren);
    allDescendantIds.push(...inheritingChildren.map((child) => String(child._id)));
    pendingParentIds = inheritingChildren.map((child) => String(child._id));
  }

  if (allDescendantIds.length === 0) {
    return;
  }

  const permissionRows = await resourcePermissionRepo.findByResourceIdsAndCollaborators({
    teamId: resource.teamId,
    resourceType,
    resourceIds: allDescendantIds,
    collaborators: affectedCollaboratorIds,
    session
  });

  const permissionsByResource = new Map<string, CollaboratorItemType[]>();
  for (const row of permissionRows) {
    const rows = permissionsByResource.get(String(row.resourceId)) ?? [];
    rows.push(row);
    permissionsByResource.set(String(row.resourceId), rows);
  }

  const calculatorsByResourceId = new Map([
    [
      String(resource._id),
      createInheritedResourceCollaboratorCalculator({
        oldParentCollaborators: oldAffectedParentCollaborators,
        newParentCollaborators: newAffectedParentCollaborators
      })
    ]
  ]);
  const resourceIdsWithChildren = new Set(descendantNodes.map((node) => String(node.parentId)));
  const permissionPatches: ResourcePermissionPatch[] = [];

  const appendPermissionPatches = ({
    resourceId,
    oldCollaborators,
    newCollaborators
  }: {
    resourceId: string;
    oldCollaborators: CollaboratorItemType[];
    newCollaborators: CollaboratorItemType[];
  }) => {
    const oldCollaboratorsById = new Map(
      oldCollaborators.map((collaborator) => [getCollaboratorId(collaborator), collaborator])
    );
    const newCollaboratorsById = new Map(
      newCollaborators.map((collaborator) => [getCollaboratorId(collaborator), collaborator])
    );

    for (const collaborator of affectedCollaborators) {
      const collaboratorId = getCollaboratorId(collaborator);
      const oldCollaborator = oldCollaboratorsById.get(collaboratorId);
      const newCollaborator = newCollaboratorsById.get(collaboratorId);

      if (oldCollaborator?.permission === newCollaborator?.permission) continue;

      if (newCollaborator) {
        const { permission, ...collaborator } = newCollaborator;
        permissionPatches.push({
          resourceId,
          collaborator,
          action: oldCollaborator ? 'update' : 'insert',
          permission
        });
      } else if (oldCollaborator) {
        const { permission: _, ...collaborator } = oldCollaborator;
        permissionPatches.push({
          resourceId,
          collaborator,
          action: 'delete'
        });
      }
    }
  };

  // descendantNodes 按层收集，父节点的计算器会在子节点前准备完成。
  for (const child of descendantNodes) {
    const childId = String(child._id);
    const parentId = String(child.parentId);
    const calculateChildCollaborators = calculatorsByResourceId.get(parentId);
    if (!calculateChildCollaborators) continue;

    const oldChildCollaborators = permissionsByResource.get(childId) ?? [];
    const newChildCollaborators = calculateChildCollaborators(oldChildCollaborators);

    appendPermissionPatches({
      resourceId: childId,
      oldCollaborators: oldChildCollaborators,
      newCollaborators: newChildCollaborators
    });

    if (resourceIdsWithChildren.has(childId)) {
      calculatorsByResourceId.set(
        childId,
        createInheritedResourceCollaboratorCalculator({
          oldParentCollaborators: oldChildCollaborators,
          newParentCollaborators: newChildCollaborators
        })
      );
    }
  }

  if (permissionPatches.length > 0) {
    await resourcePermissionRepo.patchResources({
      teamId: resource.teamId,
      resourceType,
      patches: permissionPatches,
      session
    });
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
  parentCollaborators,
  session
}: {
  resource: SyncChildrenPermissionResourceType;
  resourceModel: ResourceModel;
  resourceType: PerResourceTypeEnum;
  oldCollaborators: CollaboratorItemType[];
  newCollaborators: CollaboratorItemType[];
  /** 兼容旧版协作者 API，用于判断继承冲突。 */
  parentCollaborators?: CollaboratorItemType[];
  session: ClientSession;
}) => {
  if (
    parentCollaborators &&
    shouldInheritResourcePermission(resource.inheritPermission) &&
    resource.parentId &&
    checkRoleUpdateConflict({
      parentClbs: parentCollaborators,
      newChildClbs: newCollaborators
    })
  ) {
    await resourceModel.updateOne({ _id: resource._id }, { inheritPermission: false }, { session });
  }

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
