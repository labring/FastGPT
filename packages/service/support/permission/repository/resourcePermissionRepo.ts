import type { AnyBulkWriteOperation, ClientSession } from '../../../common/mongo';
import type { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import type {
  CollaboratorIdType,
  CollaboratorItemType
} from '@fastgpt/global/support/permission/collaborator';
import type { ResourcePermissionType } from '@fastgpt/global/support/permission/type';
import { MongoResourcePermission } from '../schema';
import { pickCollaboratorIdFields } from '../utils';

type ResourcePermissionQuery = {
  teamId: string;
  resourceType: PerResourceTypeEnum;
  resourceId?: string;
};

const withSession = (session?: ClientSession) => (session ? { session } : undefined);
const resourceIdFilter = (resourceId?: string) =>
  resourceId === undefined ? { resourceId: { $exists: false } } : { resourceId };

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
