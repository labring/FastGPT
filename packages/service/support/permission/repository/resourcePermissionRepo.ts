import { Types, type AnyBulkWriteOperation, type ClientSession } from '../../../common/mongo';
import { MongoTransactionConflictError } from '../../../common/mongo/sessionRun';
import {
  CommonRolePerMap,
  OwnerPermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { AppRolePerMap } from '@fastgpt/global/support/permission/app/constant';
import type {
  CollaboratorIdType,
  CollaboratorItemType
} from '@fastgpt/global/support/permission/collaborator';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';
import type { ResourcePermissionType } from '@fastgpt/global/support/permission/type';
import { MongoResourcePermission } from '../schema';
import { pickCollaboratorIdFields } from '../utils';

type ResourcePermissionQuery = {
  teamId: string;
  resourceType: PerResourceTypeEnum;
  resourceId?: string;
};

export type ResourcePermissionMatchLogic = 'or' | 'and';

type ResourcePermissionResourceKey = 'resourceId' | 'resourceName';

type ResourcePermissionCollaboratorQuery = {
  teamId?: string;
  resourceType?: PerResourceTypeEnum | PerResourceTypeEnum[];
  resourceIds?: string[];
  collaborator: CollaboratorIdType;
  session?: ClientSession;
};

type ResourcePermissionResourceSelector = {
  resourceId?: string;
  resourceName?: string;
};

type ResourcePermissionSnapshot = {
  resourceId: string;
  collaborators: CollaboratorItemType[];
};

export type ResourcePermissionPatch =
  | {
      resourceId: string;
      collaborator: CollaboratorIdType;
      action: 'insert';
      permission: PermissionValueType;
    }
  | {
      resourceId: string;
      collaborator: CollaboratorIdType;
      action: 'update';
      permission: PermissionValueType;
    }
  | {
      resourceId: string;
      collaborator: CollaboratorIdType;
      action: 'delete';
    };

type FindResourceKeysByCollaboratorsPermissionProps = {
  teamId: string;
  resourceType: PerResourceTypeEnum;
  tmbId: string;
  groupIds: string[];
  orgIds: string[];
  permission: PermissionValueType;
  matchLogic: ResourcePermissionMatchLogic;
  personalPermissionPriority: boolean;
};

const withSession = (session?: ClientSession) => (session ? { session } : undefined);
const resourceIdFilter = (resourceId?: string) =>
  // 历史团队 ACL 既可能存储 null，也可能没有 resourceId 字段。
  resourceId == null || resourceId === '' ? { resourceId: null } : { resourceId };

/**
 * resource_permissions 的唯一数据访问入口。
 * 该模块只处理查询、写入和删除，不包含父子资源权限语义。
 */
export const resourcePermissionRepo = {
  findByResource: ({
    teamId,
    resourceType,
    resourceId,
    session
  }: ResourcePermissionQuery & { session?: ClientSession }) =>
    MongoResourcePermission.find(
      {
        teamId,
        resourceType,
        ...resourceIdFilter(resourceId)
      },
      undefined,
      withSession(session)
    ).lean(),

  findByResourceIds: ({
    teamId,
    resourceType,
    resourceIds,
    session
  }: {
    teamId: string;
    resourceType: PerResourceTypeEnum;
    resourceIds: string[];
    session?: ClientSession;
  }) =>
    MongoResourcePermission.find(
      {
        teamId,
        resourceType,
        resourceId: { $in: resourceIds }
      },
      undefined,
      withSession(session)
    ).lean(),

  findByResourceIdsAndCollaborators: ({
    teamId,
    resourceType,
    resourceIds,
    collaborators,
    session
  }: {
    teamId: string;
    resourceType: PerResourceTypeEnum;
    resourceIds: string[];
    collaborators: CollaboratorIdType[];
    session?: ClientSession;
  }) => {
    if (resourceIds.length === 0 || collaborators.length === 0) return Promise.resolve([]);

    const collaboratorFilters = collaborators
      .map(pickCollaboratorIdFields)
      .filter((filter) => Object.keys(filter).length === 1);
    if (collaboratorFilters.length === 0) return Promise.resolve([]);

    return MongoResourcePermission.find(
      {
        teamId,
        resourceType,
        resourceId: { $in: resourceIds },
        $or: collaboratorFilters
      },
      'resourceId permission tmbId groupId orgId',
      withSession(session)
    ).lean();
  },

  findByResourceName: ({
    teamId,
    resourceType,
    resourceName,
    session
  }: ResourcePermissionQuery & { resourceName: string; session?: ClientSession }) =>
    MongoResourcePermission.find(
      { teamId, resourceType, resourceName },
      undefined,
      withSession(session)
    ).lean(),

  findByTeam: ({
    teamId,
    resourceType,
    session
  }: {
    teamId: string;
    resourceType: PerResourceTypeEnum;
    session?: ClientSession;
  }) =>
    MongoResourcePermission.find(
      {
        teamId,
        resourceType,
        $or: [{ resourceId: { $exists: true } }, { resourceName: { $exists: true } }]
      },
      undefined,
      withSession(session)
    ).lean(),

  /**
   * 查询成员对资源拥有指定权限位的资源标识。
   * ACL 中保存的是 role 位，查询会先转换为可满足目标权限的 role 位；group/org ACL 会按资源合并，
   * 个人优先时，存在个人 ACL 的资源不会再使用 group/org ACL 补权。
   */
  findResourceKeysByCollaboratorsPermission: async ({
    teamId,
    resourceType,
    tmbId,
    groupIds,
    orgIds,
    permission,
    matchLogic,
    personalPermissionPriority
  }: FindResourceKeysByCollaboratorsPermissionProps) => {
    if (permission === OwnerPermissionVal) {
      throw new Error('Owner permission must be checked through owner authorization');
    }
    if (matchLogic !== 'or' && matchLogic !== 'and') {
      throw new Error(`Unsupported permission match logic: ${matchLogic}`);
    }

    const getResourceKey = (): ResourcePermissionResourceKey => {
      if (resourceType === PerResourceTypeEnum.model) return 'resourceName';
      if (
        [
          PerResourceTypeEnum.app,
          PerResourceTypeEnum.dataset,
          PerResourceTypeEnum.agentSkill
        ].includes(resourceType)
      ) {
        return 'resourceId';
      }
      throw new Error(`Resource type ${resourceType} does not support resource list queries`);
    };

    const getPermissionBits = () => {
      if (!Number.isSafeInteger(permission) || permission <= 0) {
        throw new Error('Permission mask must be a positive safe integer');
      }

      const bits: number[] = [];
      let remaining = permission;
      let bit = 1;
      while (remaining > 0) {
        if (remaining % 2 === 1) bits.push(bit);
        remaining = Math.floor(remaining / 2);
        bit *= 2;
      }
      return bits;
    };

    const getRoleMasks = () => {
      const permissionBits = getPermissionBits();
      const rolePerMap =
        resourceType === PerResourceTypeEnum.app ? AppRolePerMap : CommonRolePerMap;
      return permissionBits.map((permissionBit) => {
        const roleMask = Array.from(rolePerMap.entries()).reduce(
          (mask, [role, rolePermission]) =>
            (rolePermission & permissionBit) === permissionBit ? mask | role : mask,
          0
        );
        if (roleMask === 0) {
          throw new Error(`Permission bit ${permissionBit} is not supported by common roles`);
        }
        return roleMask;
      });
    };

    const getRolePermissionFilter = (roleMask: number) => {
      const isSingleRole = (roleMask & (roleMask - 1)) === 0;
      return isSingleRole ? { $bitsAllSet: roleMask } : { $bitsAnySet: roleMask };
    };

    const toResourceKeySet = (resourceKeys: unknown[]) =>
      new Set(resourceKeys.filter((key) => key !== undefined && key !== null).map(String));

    const intersectSets = (sets: Set<string>[]) => {
      if (sets.length === 0) return new Set<string>();
      const [first, ...rest] = sets;
      return new Set(Array.from(first).filter((key) => rest.every((set) => set.has(key))));
    };

    const differenceSets = (left: Set<string>, right: Set<string>) =>
      new Set(Array.from(left).filter((key) => !right.has(key)));

    const resourceKey = getResourceKey();
    const roleMasks = getRoleMasks();
    const baseQuery = {
      teamId,
      resourceType,
      [resourceKey]: { $exists: true }
    };

    const findResourceKeys = async ({
      collaborators,
      permissionFilter
    }: {
      collaborators: Record<string, unknown>[];
      permissionFilter?: Record<string, unknown>;
    }) => {
      if (collaborators.length === 0) return new Set<string>();

      const filter = {
        ...baseQuery,
        ...(collaborators.length === 1 ? collaborators[0] : { $or: collaborators }),
        ...permissionFilter
      };
      const resourceKeys = await MongoResourcePermission.distinct(resourceKey, filter);
      return toResourceKeySet(resourceKeys);
    };

    const findMatchedResourceKeys = async (collaborators: Record<string, unknown>[]) => {
      if (matchLogic === 'or') {
        return findResourceKeys({
          collaborators,
          permissionFilter: {
            permission: getRolePermissionFilter(roleMasks.reduce((mask, role) => mask | role, 0))
          }
        });
      }

      const permissionSets = await Promise.all(
        roleMasks.map((roleMask) =>
          findResourceKeys({
            collaborators,
            permissionFilter: {
              permission: getRolePermissionFilter(roleMask)
            }
          })
        )
      );
      return intersectSets(permissionSets);
    };

    const personalCollaborators = [{ tmbId }];
    const groupAndOrgCollaborators = [
      ...(groupIds.length > 0 ? [{ groupId: { $in: groupIds } }] : []),
      ...(orgIds.length > 0 ? [{ orgId: { $in: orgIds } }] : [])
    ];

    if (!personalPermissionPriority) {
      return Array.from(
        await findMatchedResourceKeys([...personalCollaborators, ...groupAndOrgCollaborators])
      );
    }

    const [personalResourceKeys, personalMatchedResourceKeys, groupAndOrgMatchedResourceKeys] =
      await Promise.all([
        findResourceKeys({ collaborators: personalCollaborators }),
        findMatchedResourceKeys(personalCollaborators),
        findMatchedResourceKeys(groupAndOrgCollaborators)
      ]);

    return Array.from(
      new Set([
        ...personalMatchedResourceKeys,
        ...differenceSets(groupAndOrgMatchedResourceKeys, personalResourceKeys)
      ])
    );
  },

  findOne: ({
    teamId,
    resourceType,
    resourceId,
    collaborator,
    session
  }: ResourcePermissionQuery & {
    collaborator: CollaboratorIdType;
    session?: ClientSession;
  }) =>
    MongoResourcePermission.findOne(
      {
        teamId,
        resourceType,
        ...resourceIdFilter(resourceId),
        ...pickCollaboratorIdFields(collaborator)
      },
      'permission',
      withSession(session)
    ).lean(),

  findOneByResourceName: ({
    teamId,
    resourceType,
    resourceName,
    collaborator,
    session
  }: ResourcePermissionQuery & {
    resourceName: string;
    collaborator: CollaboratorIdType;
    session?: ClientSession;
  }) =>
    MongoResourcePermission.findOne(
      {
        teamId,
        resourceType,
        resourceName,
        ...pickCollaboratorIdFields(collaborator)
      },
      'permission',
      withSession(session)
    ).lean(),

  findByCollaborators: async ({
    teamId,
    resourceType,
    resourceId,
    collaborators,
    session
  }: ResourcePermissionQuery & {
    collaborators: CollaboratorIdType[];
    session?: ClientSession;
  }) => {
    const collaboratorFilters = collaborators.map(pickCollaboratorIdFields).filter((filter) => {
      const [id] = Object.values(filter);
      return (
        Object.keys(filter).length === 1 && typeof id === 'string' && Types.ObjectId.isValid(id)
      );
    });

    if (collaboratorFilters.length === 0) return [];

    return MongoResourcePermission.find(
      {
        teamId,
        resourceType,
        ...resourceIdFilter(resourceId),
        $or: collaboratorFilters
      },
      'permission tmbId groupId orgId resourceId resourceType teamId',
      withSession(session)
    ).lean();
  },

  findByCollaborator: ({
    teamId,
    resourceType,
    resourceIds,
    collaborator,
    session
  }: ResourcePermissionCollaboratorQuery) =>
    MongoResourcePermission.find(
      {
        ...(teamId ? { teamId } : {}),
        ...(resourceType
          ? { resourceType: Array.isArray(resourceType) ? { $in: resourceType } : resourceType }
          : {}),
        ...(resourceIds ? { resourceId: { $in: resourceIds } } : {}),
        ...pickCollaboratorIdFields(collaborator)
      },
      undefined,
      withSession(session)
    ).lean(),

  findTeamCollaborator: ({
    teamId,
    collaborator,
    session
  }: {
    teamId: string;
    collaborator: CollaboratorIdType;
    session?: ClientSession;
  }) =>
    MongoResourcePermission.findOne(
      {
        teamId,
        resourceType: PerResourceTypeEnum.team,
        ...resourceIdFilter(undefined),
        ...pickCollaboratorIdFields(collaborator)
      },
      undefined,
      withSession(session)
    ).lean(),

  insertOne: (document: ResourcePermissionType, session?: ClientSession) =>
    MongoResourcePermission.insertOne(document, withSession(session)),

  bulkWrite: (
    operations: AnyBulkWriteOperation<ResourcePermissionType>[],
    session?: ClientSession
  ) => MongoResourcePermission.bulkWrite(operations, withSession(session)),

  /** 更新一个协作者的单条 ACL；资源 ID 未传时兼容历史团队 ACL。 */
  updateCollaborator: async ({
    teamId,
    resourceType,
    resourceId,
    resourceName,
    collaborator,
    permission,
    session
  }: ResourcePermissionQuery &
    ResourcePermissionResourceSelector & {
      collaborator: CollaboratorIdType;
      permission: PermissionValueType;
      session?: ClientSession;
    }) => {
    const resourceSelector = resourceName
      ? { resourceName }
      : resourceId !== undefined
        ? { resourceId }
        : resourceIdFilter(undefined);

    return MongoResourcePermission.updateOne(
      {
        teamId,
        resourceType,
        ...resourceSelector,
        ...pickCollaboratorIdFields(collaborator)
      },
      {
        $set: { permission }
      },
      { ...withSession(session), upsert: true }
    );
  },

  /** 为多个资源授予同一协作者权限，缺少 ACL 行时逐资源 upsert。 */
  grantCollaboratorOnResources: async ({
    teamId,
    resourceTypes,
    resourceIds,
    collaborator,
    permission,
    session
  }: {
    teamId: string;
    resourceTypes: PerResourceTypeEnum[];
    resourceIds: string[];
    collaborator: CollaboratorIdType;
    permission: PermissionValueType;
    session?: ClientSession;
  }) => {
    if (resourceIds.length === 0) return;

    await MongoResourcePermission.bulkWrite(
      resourceIds.flatMap((resourceId) =>
        resourceTypes.map((resourceType) => ({
          updateOne: {
            filter: {
              teamId,
              resourceType,
              resourceId,
              ...pickCollaboratorIdFields(collaborator)
            },
            update: { $set: { permission } },
            upsert: true
          }
        }))
      ) as AnyBulkWriteOperation<ResourcePermissionType>[],
      withSession(session)
    );
  },

  deleteByResource: ({
    teamId,
    resourceType,
    resourceId,
    session
  }: ResourcePermissionQuery & { session?: ClientSession }) =>
    MongoResourcePermission.deleteMany(
      { teamId, resourceType, ...resourceIdFilter(resourceId) },
      withSession(session)
    ),

  deleteByResources: ({
    teamId,
    resourceType,
    resourceIds,
    session
  }: {
    teamId: string;
    resourceType: PerResourceTypeEnum;
    resourceIds: string[];
    session?: ClientSession;
  }) =>
    MongoResourcePermission.deleteMany(
      { teamId, resourceType, resourceId: { $in: resourceIds } },
      withSession(session)
    ),

  deleteByTeam: (teamId: string, session?: ClientSession) =>
    MongoResourcePermission.deleteMany({ teamId }, withSession(session)),

  deleteCollaborator: ({
    teamId,
    collaborator,
    resourceType,
    session
  }: {
    teamId?: string;
    collaborator: CollaboratorIdType;
    resourceType?: PerResourceTypeEnum | PerResourceTypeEnum[];
    session?: ClientSession;
  }) =>
    MongoResourcePermission.deleteMany(
      {
        ...(teamId ? { teamId } : {}),
        ...(resourceType
          ? { resourceType: Array.isArray(resourceType) ? { $in: resourceType } : resourceType }
          : {}),
        ...pickCollaboratorIdFields(collaborator)
      },
      withSession(session)
    ),

  /** 供数据清洗使用的有界游标读取，游标实现仍隐藏在仓储层。 */
  findCursor: ({
    query,
    projection,
    limit,
    batchSize
  }: {
    query: Record<string, unknown>;
    projection: Record<string, 0 | 1>;
    limit: number;
    batchSize: number;
  }) =>
    MongoResourcePermission.collection
      .find(query as any, { projection })
      .sort({ _id: 1 })
      .limit(limit)
      .batchSize(batchSize),

  deleteByFilter: (filter: unknown) =>
    MongoResourcePermission.collection.deleteMany(filter as Record<string, unknown>),

  findOneByFilter: <T>(filter: unknown, projection?: Record<string, 0 | 1>) =>
    MongoResourcePermission.collection.findOne<T>(filter as Record<string, unknown>, {
      ...(projection ? { projection } : {})
    }),

  /** 用一个完整快照替换资源 ACL，空快照会删除该资源的全部 ACL 行。 */
  replaceResource: async ({
    teamId,
    resourceType,
    resourceId,
    collaborators,
    session
  }: ResourcePermissionQuery & {
    resourceId: string;
    collaborators: CollaboratorItemType[];
    session?: ClientSession;
  }) => {
    await MongoResourcePermission.deleteMany(
      { teamId, resourceType, resourceId },
      withSession(session)
    );

    if (collaborators.length === 0) return;

    await MongoResourcePermission.insertMany(
      collaborators.map(
        (collaborator) =>
          ({
            teamId,
            resourceType,
            resourceId,
            permission: collaborator.permission,
            ...pickCollaboratorIdFields(collaborator)
          }) as ResourcePermissionType
      ),
      { ...(session ? { session } : {}), ordered: true }
    );
  },

  /** 批量替换多个资源 ACL，避免继承同步按资源串行执行删除和插入。 */
  replaceResources: async ({
    teamId,
    resourceType,
    resources,
    session
  }: ResourcePermissionQuery & {
    resources: ResourcePermissionSnapshot[];
    session?: ClientSession;
  }) => {
    if (resources.length === 0) return;

    const snapshots = new Map(
      resources.map((resource) => [String(resource.resourceId), resource.collaborators])
    );
    const resourceIds = Array.from(snapshots.keys());

    await MongoResourcePermission.deleteMany(
      { teamId, resourceType, resourceId: { $in: resourceIds } },
      withSession(session)
    );

    const documents = Array.from(snapshots).flatMap(([resourceId, collaborators]) =>
      collaborators.map(
        (collaborator) =>
          ({
            teamId,
            resourceType,
            resourceId,
            permission: collaborator.permission,
            ...pickCollaboratorIdFields(collaborator)
          }) as ResourcePermissionType
      )
    );

    const insertBatchSize = 100000;
    for (let index = 0; index < documents.length; index += insertBatchSize) {
      await MongoResourcePermission.insertMany(documents.slice(index, index + insertBatchSize), {
        ...(session ? { session } : {}),
        ordered: true
      });
    }
  },

  /** 批量增量更新资源 ACL，只触碰受影响的协作者行。 */
  patchResources: async ({
    teamId,
    resourceType,
    patches,
    session
  }: {
    teamId: string;
    resourceType: PerResourceTypeEnum;
    patches: ResourcePermissionPatch[];
    session?: ClientSession;
  }) => {
    if (patches.length === 0) return;

    const patchesByKey = new Map<string, ResourcePermissionPatch>();
    for (const patch of patches) {
      const collaborator = pickCollaboratorIdFields(patch.collaborator);
      patchesByKey.set(`${patch.resourceId}:${JSON.stringify(collaborator)}`, patch);
    }

    const insertDocuments: ResourcePermissionType[] = [];
    const updateOperations: AnyBulkWriteOperation<ResourcePermissionType>[] = [];
    const deleteOperations: AnyBulkWriteOperation<ResourcePermissionType>[] = [];

    for (const patch of patchesByKey.values()) {
      const collaborator = pickCollaboratorIdFields(patch.collaborator);
      const filter = {
        teamId,
        resourceType,
        resourceId: patch.resourceId,
        ...collaborator
      };

      if (patch.action === 'delete') {
        deleteOperations.push({ deleteOne: { filter } });
        continue;
      }

      if (patch.action === 'insert') {
        insertDocuments.push({
          teamId,
          resourceType,
          resourceId: patch.resourceId,
          permission: patch.permission,
          ...collaborator
        } as ResourcePermissionType);
        continue;
      }

      updateOperations.push({
        updateOne: {
          filter,
          update: { $set: { permission: patch.permission } }
        }
      });
    }

    const batchSize = 1000000;
    const runBulkWrite = async (operations: AnyBulkWriteOperation<ResourcePermissionType>[]) => {
      for (let index = 0; index < operations.length; index += batchSize) {
        await MongoResourcePermission.bulkWrite(
          operations.slice(index, index + batchSize),
          withSession(session)
        );
      }
    };

    await runBulkWrite(deleteOperations);

    for (let index = 0; index < updateOperations.length; index += batchSize) {
      const operations = updateOperations.slice(index, index + batchSize);
      const result = await MongoResourcePermission.bulkWrite(operations, withSession(session));
      if (result.matchedCount !== operations.length) {
        throw new MongoTransactionConflictError(
          new Error('Resource permission update matched fewer rows than expected')
        );
      }
    }

    try {
      for (let index = 0; index < insertDocuments.length; index += batchSize) {
        await MongoResourcePermission.insertMany(insertDocuments.slice(index, index + batchSize), {
          ...(session ? { session } : {}),
          ordered: true
        });
      }
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === 11000 || code === 11001 || code === 112) {
        throw new MongoTransactionConflictError(error);
      }
      throw error;
    }
  },

  /** 用资源名替换完整 ACL，供模型权限使用。 */
  replaceResourceByName: async ({
    teamId,
    resourceType,
    resourceName,
    collaborators,
    session
  }: ResourcePermissionQuery & {
    resourceName: string;
    collaborators: CollaboratorItemType[];
    session?: ClientSession;
  }) => {
    await MongoResourcePermission.deleteMany(
      { teamId, resourceType, resourceName },
      withSession(session)
    );

    if (collaborators.length === 0) return;

    await MongoResourcePermission.insertMany(
      collaborators.map(
        (collaborator) =>
          ({
            teamId,
            resourceType,
            resourceName,
            permission: collaborator.permission,
            ...pickCollaboratorIdFields(collaborator)
          }) as ResourcePermissionType
      ),
      { ...(session ? { session } : {}), ordered: true }
    );
  },

  /** 用完整快照替换团队 ACL，团队 ACL 的 resourceId 兼容 null 和缺失字段。 */
  replaceTeam: async ({
    teamId,
    collaborators,
    session
  }: {
    teamId: string;
    collaborators: CollaboratorItemType[];
    session?: ClientSession;
  }) => {
    await MongoResourcePermission.deleteMany(
      { teamId, resourceType: PerResourceTypeEnum.team, ...resourceIdFilter(undefined) },
      withSession(session)
    );

    if (collaborators.length === 0) return;

    await MongoResourcePermission.insertMany(
      collaborators.map(
        (collaborator) =>
          ({
            teamId,
            resourceType: PerResourceTypeEnum.team,
            permission: collaborator.permission,
            ...pickCollaboratorIdFields(collaborator)
          }) as ResourcePermissionType
      ),
      { ...(session ? { session } : {}), ordered: true }
    );
  },

  /** 将一个成员的 ACL 转移给另一个成员，同资源冲突时按位合并权限。 */
  transferTmbPermissions: async ({
    teamId,
    oldTmbId,
    newTmbId,
    resourceType,
    resourceIds,
    session
  }: {
    teamId: string;
    oldTmbId: string;
    newTmbId: string;
    resourceType?: PerResourceTypeEnum | PerResourceTypeEnum[];
    resourceIds?: string[];
    session?: ClientSession;
  }) => {
    const rows = await MongoResourcePermission.find(
      {
        teamId,
        tmbId: { $in: [oldTmbId, newTmbId] },
        ...(resourceType
          ? { resourceType: Array.isArray(resourceType) ? { $in: resourceType } : resourceType }
          : {}),
        ...(resourceIds ? { resourceId: { $in: resourceIds } } : {})
      },
      undefined,
      withSession(session)
    ).lean();

    const oldRows = rows.filter((row) => String(row.tmbId) === String(oldTmbId));
    const newRows = rows.filter((row) => String(row.tmbId) === String(newTmbId));
    const operations: AnyBulkWriteOperation<ResourcePermissionType>[] = [];
    const resourceKey = (row: {
      resourceType: string;
      resourceId?: unknown;
      resourceName?: unknown;
    }) => `${row.resourceType}:${String(row.resourceId ?? '')}:${String(row.resourceName ?? '')}`;

    for (const oldRow of oldRows) {
      const newRow = newRows.find((row) => resourceKey(row) === resourceKey(oldRow));
      if (newRow) {
        operations.push({ deleteOne: { filter: { _id: newRow._id } } });
        operations.push({
          updateOne: {
            filter: { _id: oldRow._id },
            update: {
              $set: {
                tmbId: newTmbId,
                permission: oldRow.permission | newRow.permission
              }
            }
          }
        });
      } else {
        operations.push({
          updateOne: {
            filter: { _id: oldRow._id },
            update: { $set: { tmbId: newTmbId } }
          }
        });
      }
    }

    if (operations.length > 0)
      await MongoResourcePermission.bulkWrite(operations, withSession(session));
  },

  /** 按组织 pathId 替换组织 ACL，目标组织冲突时按位合并权限位。 */
  migrateOrgPermissions: async ({
    teamId,
    orgIdMap,
    session
  }: {
    teamId: string;
    orgIdMap: Map<string, string | undefined>;
    session?: ClientSession;
  }) => {
    const rows = await MongoResourcePermission.find(
      { teamId, orgId: { $exists: true } },
      undefined,
      withSession(session)
    ).lean();
    const operations: AnyBulkWriteOperation<ResourcePermissionType>[] = [];
    const rowKey = (row: { resourceType: string; resourceId?: unknown; resourceName?: unknown }) =>
      `${row.resourceType}:${String(row.resourceId ?? '')}:${String(row.resourceName ?? '')}`;
    const targetRows = new Map<string, any>(
      rows
        .filter((row) => !orgIdMap.has(String(row.orgId)))
        .map((row) => [`${rowKey(row)}:${String(row.orgId)}`, row])
    );

    for (const row of rows) {
      if (!orgIdMap.has(String(row.orgId))) continue;
      const newOrgId = orgIdMap.get(String(row.orgId));
      if (newOrgId === undefined) {
        operations.push({ deleteOne: { filter: { _id: row._id } } });
        continue;
      }

      const targetKey = `${rowKey(row)}:${newOrgId}`;
      const target = targetRows.get(targetKey);
      if (target && String(target._id) !== String(row._id)) {
        operations.push({ deleteOne: { filter: { _id: row._id } } });
        operations.push({
          updateOne: {
            filter: { _id: target._id },
            update: { $set: { permission: target.permission | row.permission } }
          }
        });
        target.permission |= row.permission;
      } else {
        operations.push({
          updateOne: {
            filter: { _id: row._id },
            update: { $set: { orgId: newOrgId } }
          }
        });
        targetRows.set(targetKey, { ...row, orgId: newOrgId });
      }
    }

    if (operations.length > 0)
      await MongoResourcePermission.bulkWrite(operations, withSession(session));
  }
};
