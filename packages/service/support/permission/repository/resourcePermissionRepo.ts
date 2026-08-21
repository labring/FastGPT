import type { AnyBulkWriteOperation, ClientSession } from '../../../common/mongo';
import {
  CommonRolePerMap,
  OwnerPermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
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
  resourceId === undefined ? { resourceId: null } : { resourceId };

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
      return permissionBits.map((permissionBit) => {
        const roleMask = Array.from(CommonRolePerMap.entries()).reduce(
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

  findByCollaborators: ({
    teamId,
    resourceType,
    resourceId,
    collaborators,
    session
  }: ResourcePermissionQuery & {
    collaborators: CollaboratorIdType[];
    session?: ClientSession;
  }) =>
    MongoResourcePermission.find(
      {
        teamId,
        resourceType,
        ...resourceIdFilter(resourceId),
        $or: collaborators.map(pickCollaboratorIdFields)
      },
      'permission tmbId groupId orgId resourceId resourceType teamId',
      withSession(session)
    ).lean(),

  insertOne: (document: ResourcePermissionType, session?: ClientSession) =>
    MongoResourcePermission.insertOne(document, withSession(session)),

  bulkWrite: (
    operations: AnyBulkWriteOperation<ResourcePermissionType>[],
    session?: ClientSession
  ) => MongoResourcePermission.bulkWrite(operations, withSession(session)),

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
  }
};
