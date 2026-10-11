/**
 * Sandbox 实例原子层。
 *
 * Repository 只负责 v2 记录查询和 `status + operation.id` CAS，不执行任何远端副作用。
 */
import { randomUUID } from 'node:crypto';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { SANDBOX_WORKSPACE_VOLUME_NAME } from '@fastgpt/global/core/ai/sandbox/volume';
import { Types } from '../../../../../common/mongo';
import { mongoSessionRun } from '../../../../../common/mongo/sessionRun';
import { MongoSandboxInstance } from './schema';
import {
  sandboxActiveStatusList,
  SandboxInstanceStatusEnum,
  SandboxOperationTypeEnum,
  type SandboxInstanceSchemaType,
  type SandboxInstanceStatusType,
  type SandboxOperationType,
  type SandboxProviderType,
  type SandboxStableStatusType
} from '../../type';

const SANDBOX_ARCHIVE_CURSOR_BATCH_SIZE = 100;
const stableStatuses = new Set<SandboxInstanceStatusType>([
  SandboxInstanceStatusEnum.running,
  SandboxInstanceStatusEnum.stopped,
  SandboxInstanceStatusEnum.archived
]);

export type SandboxResourceDoc = Pick<
  SandboxInstanceSchemaType,
  | 'provider'
  | 'sandboxId'
  | 'sourceType'
  | 'sourceId'
  | 'userId'
  | 'status'
  | 'lastActiveAt'
  | 'limit'
  | 'storage'
  | 'teamId'
  | 'image'
  | 'versionId'
  | 'operation'
> & {
  _id: unknown;
};

export type SandboxResourceRef = Partial<
  Pick<
    SandboxResourceDoc,
    | 'status'
    | 'lastActiveAt'
    | 'sourceType'
    | 'sourceId'
    | 'userId'
    | 'teamId'
    | 'image'
    | 'versionId'
    | 'storage'
    | 'operation'
  >
> & {
  provider: SandboxProviderType;
  sandboxId: string;
  _id?: unknown;
};

export type SandboxSourceParams = {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId?: string;
};

export type ClaimSandboxOperationParams = {
  resource: SandboxResourceRef;
  status: Exclude<SandboxInstanceStatusType, SandboxStableStatusType>;
  type: SandboxOperationType;
  phase?: string;
  previousStatus?: SandboxStableStatusType;
  matchLastActiveAt?: boolean;
};

const isMongoDuplicateKeyError = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 11000;

const buildSandboxResourceRecordFilter = (resource: SandboxResourceRef) =>
  resource._id !== undefined
    ? { _id: resource._id }
    : { provider: resource.provider, sandboxId: resource.sandboxId };

const buildCurrentOperationFilter = (resource: SandboxResourceRef) => {
  const operationId = resource.operation?.id;
  return operationId ? { 'operation.id': operationId } : { operation: { $exists: false } };
};

const buildSandboxResourceSourceQuery = ({ sourceType, sourceId, userId }: SandboxSourceParams) => {
  if (sourceType === ChatSourceTypeEnum.app || sourceType === ChatSourceTypeEnum.skillEdit) {
    return { sourceType, sourceId, ...(userId ? { userId } : {}) };
  }
  if (sourceType === ChatSourceTypeEnum.chatAgentHelper) {
    throw new Error('ChatAgentHelper source does not support sandbox resources');
  }

  const exhaustiveCheck: never = sourceType;
  throw new Error(`Unsupported sandbox source type: ${exhaustiveCheck}`);
};

type SandboxStableFields = Pick<SandboxInstanceSchemaType, 'teamId' | 'image' | 'versionId'>;

const buildSandboxStableFieldsSet = (fields: SandboxStableFields) => ({
  ...(fields.teamId !== undefined ? { teamId: fields.teamId } : {}),
  ...(fields.image !== undefined ? { image: fields.image } : {}),
  ...(fields.versionId !== undefined ? { versionId: fields.versionId } : {})
});

const expectedOperationByStatus: Record<
  Exclude<SandboxInstanceStatusType, SandboxStableStatusType>,
  SandboxOperationType
> = {
  provisioning: SandboxOperationTypeEnum.provision,
  legacyMigrating: SandboxOperationTypeEnum.legacyMigration,
  stopping: SandboxOperationTypeEnum.stop,
  archiving: SandboxOperationTypeEnum.archive,
  restoring: SandboxOperationTypeEnum.restore,
  deleting: SandboxOperationTypeEnum.delete
};

const assertOperationMatchesStatus = (
  status: Exclude<SandboxInstanceStatusType, SandboxStableStatusType>,
  type: SandboxOperationType
) => {
  if (expectedOperationByStatus[status] !== type) {
    throw new Error(`Status ${status} requires ${expectedOperationByStatus[status]} operation`);
  }
};

/** 原子抢占一条记录进入过渡态，并为本轮操作生成唯一 fencing token。 */
export async function claimSandboxOperation(params: ClaimSandboxOperationParams) {
  const { resource, status, type, phase, previousStatus, matchLastActiveAt = false } = params;
  assertOperationMatchesStatus(status, type);
  const now = new Date();
  const operationId = randomUUID();
  const derivedPreviousStatus =
    previousStatus ??
    (resource.status && stableStatuses.has(resource.status)
      ? (resource.status as SandboxStableStatusType)
      : resource.operation?.previousStatus);
  const nextPhase =
    phase ??
    (resource.status === status && resource.operation?.type === type
      ? resource.operation.phase
      : 'claimed');

  return MongoSandboxInstance.findOneAndUpdate(
    {
      ...buildSandboxResourceRecordFilter(resource),
      ...(resource.status ? { status: resource.status } : {}),
      ...buildCurrentOperationFilter(resource),
      ...(matchLastActiveAt && resource.lastActiveAt ? { lastActiveAt: resource.lastActiveAt } : {})
    },
    {
      $set: {
        status,
        operation: {
          id: operationId,
          type,
          phase: nextPhase,
          ...(derivedPreviousStatus ? { previousStatus: derivedPreviousStatus } : {}),
          startedAt: now,
          heartbeatAt: now
        }
      }
    },
    { new: true }
  ).lean<SandboxResourceDoc | null>();
}

/** 按 operation token 持久化一个幂等阶段，旧执行者无法推进新 operation。 */
export async function advanceSandboxOperation(params: {
  resource: SandboxResourceRef;
  operationId: string;
  status: Exclude<SandboxInstanceStatusType, SandboxStableStatusType>;
  phase: string;
  set?: Record<string, unknown>;
}) {
  return MongoSandboxInstance.findOneAndUpdate(
    {
      ...buildSandboxResourceRecordFilter(params.resource),
      status: params.status,
      'operation.id': params.operationId
    },
    {
      $set: {
        ...(params.set ?? {}),
        'operation.phase': params.phase,
        'operation.heartbeatAt': new Date()
      },
      $unset: {
        'operation.failedAt': '',
        'operation.error': ''
      }
    },
    { new: true }
  ).lean<SandboxResourceDoc | null>();
}

/** 保留过渡态并记录错误，供同一操作重试或 stale recovery 接管。 */
export async function markSandboxOperationFailed(params: {
  resource: SandboxResourceRef;
  operationId: string;
  status: Exclude<SandboxInstanceStatusType, SandboxStableStatusType>;
  error: string;
}) {
  return MongoSandboxInstance.updateOne(
    {
      ...buildSandboxResourceRecordFilter(params.resource),
      status: params.status,
      'operation.id': params.operationId
    },
    {
      $set: {
        'operation.failedAt': new Date(),
        'operation.error': params.error,
        'operation.heartbeatAt': new Date()
      }
    }
  );
}

/** 按 operation token 提交稳定态并清除临时 operation。 */
export async function completeSandboxOperation(params: {
  resource: SandboxResourceRef;
  operationId: string;
  fromStatus: Exclude<SandboxInstanceStatusType, SandboxStableStatusType>;
  status: SandboxStableStatusType;
  set?: Record<string, unknown>;
  touchActive?: boolean;
}) {
  if (!stableStatuses.has(params.status)) {
    throw new Error(`Cannot complete sandbox operation to non-stable status ${params.status}`);
  }

  return MongoSandboxInstance.findOneAndUpdate(
    {
      ...buildSandboxResourceRecordFilter(params.resource),
      status: params.fromStatus,
      'operation.id': params.operationId
    },
    {
      $set: {
        status: params.status,
        ...(params.touchActive ? { lastActiveAt: new Date() } : {}),
        ...(params.set ?? {})
      },
      $unset: { operation: '' }
    },
    { new: true }
  ).lean<SandboxResourceDoc | null>();
}

/** 仅在当前 deleting operation 仍持有 token 时删除记录。 */
export async function deleteClaimedSandboxRecord(params: {
  resource: SandboxResourceRef;
  operationId: string;
}) {
  return MongoSandboxInstance.deleteOne({
    ...buildSandboxResourceRecordFilter(params.resource),
    status: SandboxInstanceStatusEnum.deleting,
    'operation.id': params.operationId
  });
}

/** 创建首次 provisioning 占位；唯一键冲突时返回已经存在的逻辑记录。 */
export async function createSandboxProvisioningInstance(
  params: {
    provider: SandboxProviderType;
    sandboxId: string;
    sourceType: ChatSourceTypeEnum;
    sourceId: string;
    userId: string;
    storage?: SandboxInstanceSchemaType['storage'];
    limit?: Partial<NonNullable<SandboxInstanceSchemaType['limit']>>;
  } & SandboxStableFields
) {
  const now = new Date();
  const operationId = randomUUID();

  try {
    const created = await MongoSandboxInstance.create({
      provider: params.provider,
      sandboxId: params.sandboxId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      userId: params.userId,
      status: SandboxInstanceStatusEnum.provisioning,
      lastActiveAt: now,
      createdAt: now,
      storage: params.storage,
      limit: params.limit,
      ...buildSandboxStableFieldsSet(params),
      operation: {
        id: operationId,
        type: SandboxOperationTypeEnum.provision,
        phase: 'claimed',
        startedAt: now,
        heartbeatAt: now
      }
    });
    return { instance: created.toObject() as SandboxResourceDoc, created: true };
  } catch (error) {
    if (!isMongoDuplicateKeyError(error)) throw error;
    const existing = await findSandboxInstanceBySource({
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      userId: params.userId
    });
    return { instance: existing, created: false };
  }
}

/**
 * 仅刷新已经发布的 running 记录；不存在或处于过渡态时绝不 upsert。
 *
 * OpenSandbox 可传入预期 workspace claimName 做 CAS，防止 lease 外构造的旧 client 在 restore
 * 提交新 generation 后继续命中快路径。storage 只能由 lifecycle checkpoint 写入，touch 不回写。
 */
export async function touchRunningSandboxInstance(params: {
  provider: SandboxProviderType;
  sandboxId: string;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  expectedWorkspaceClaimName?: string;
  limit?: Partial<NonNullable<SandboxInstanceSchemaType['limit']>>;
}) {
  return MongoSandboxInstance.findOneAndUpdate(
    {
      provider: params.provider,
      sandboxId: params.sandboxId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      userId: params.userId,
      status: SandboxInstanceStatusEnum.running,
      operation: { $exists: false },
      ...(params.expectedWorkspaceClaimName
        ? {
            'storage.volumes': {
              $elemMatch: {
                name: SANDBOX_WORKSPACE_VOLUME_NAME,
                claimName: params.expectedWorkspaceClaimName
              }
            }
          }
        : {})
    },
    {
      $set: {
        lastActiveAt: new Date(),
        ...(params.limit ? { limit: params.limit } : {})
      }
    },
    { new: true }
  ).lean<SandboxResourceDoc | null>();
}

/** 查询可被 stop cron 抢占的 running 记录。 */
export async function findInactiveRunningSandboxResources(inactiveBefore: Date) {
  return MongoSandboxInstance.find({
    status: SandboxInstanceStatusEnum.running,
    lastActiveAt: { $lt: inactiveBefore },
    operation: { $exists: false }
  }).lean<SandboxResourceDoc[]>();
}

/** 流式读取 stopped 归档候选。 */
export function createSandboxResourcesToArchiveCursor(inactiveBefore: Date) {
  return MongoSandboxInstance.find({
    provider: { $in: ['opensandbox', 'sealosdevbox'] },
    status: SandboxInstanceStatusEnum.stopped,
    lastActiveAt: { $lt: inactiveBefore },
    operation: { $exists: false }
  })
    .sort({ lastActiveAt: -1 })
    .lean<SandboxResourceDoc>()
    .cursor({ batchSize: SANDBOX_ARCHIVE_CURSOR_BATCH_SIZE });
}

/** 查询超过隔离窗口、可由恢复任务接管的过渡态记录。 */
export async function findStaleSandboxOperations(params: {
  statuses: Exclude<SandboxInstanceStatusType, SandboxStableStatusType>[];
  heartbeatBefore: Date;
}) {
  return MongoSandboxInstance.find({
    status: { $in: params.statuses },
    'operation.heartbeatAt': { $lt: params.heartbeatBefore }
  }).lean<SandboxResourceDoc[]>();
}

export async function findSandboxResourcesBySource(params: SandboxSourceParams) {
  return MongoSandboxInstance.find(buildSandboxResourceSourceQuery(params)).lean<
    SandboxResourceDoc[]
  >();
}

export async function findSandboxInstanceBySandboxId(params: {
  provider?: SandboxProviderType;
  sandboxId: string;
  status?: SandboxInstanceStatusType;
}) {
  return MongoSandboxInstance.findOne({
    ...(params.provider ? { provider: params.provider } : {}),
    sandboxId: params.sandboxId,
    ...(params.status ? { status: params.status } : {})
  }).lean<SandboxResourceDoc | null>();
}

export async function findSandboxInstanceBySandboxIdAndSource(params: {
  provider?: SandboxProviderType;
  sandboxId: string;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  status?: SandboxInstanceStatusType;
}) {
  return MongoSandboxInstance.findOne({
    ...(params.provider ? { provider: params.provider } : {}),
    sandboxId: params.sandboxId,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    ...(params.status ? { status: params.status } : {})
  }).lean<SandboxResourceDoc | null>();
}

export async function existsSandboxInstanceBySandboxId(params: {
  provider: SandboxProviderType;
  sandboxId: string;
}) {
  return Boolean(await MongoSandboxInstance.exists(params));
}

export async function findSandboxInstanceBySource(params: {
  provider?: SandboxProviderType;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  status?: SandboxInstanceStatusType;
}) {
  return MongoSandboxInstance.findOne({
    ...(params.provider ? { provider: params.provider } : {}),
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    userId: params.userId,
    ...(params.status ? { status: params.status } : {})
  }).lean<SandboxResourceDoc | null>();
}

/**
 * 统计计入 Quota 的活跃实例；不传 teamId 时统计系统总量。
 *
 * 系统总上限与团队配额共用同一个池子（忽略 provider 与 sourceType），计数包含
 * provisioning/restoring 等过渡态，因此不能按 operation 是否存在过滤。
 * 缺失 teamId 的历史记录不计入任何团队，但仍计入系统总量。
 */
export async function countActiveSandboxInstances(params: { teamId?: string } = {}) {
  return MongoSandboxInstance.countDocuments({
    status: { $in: [...sandboxActiveStatusList] },
    ...(params.teamId ? { teamId: params.teamId } : {})
  });
}

/** 只为历史缺失 teamId 的记录补齐归属；已有 teamId 的记录绝不覆写。 */
export async function backfillSandboxInstanceTeamId(params: {
  provider: SandboxProviderType;
  sandboxId: string;
  teamId: string;
}) {
  return MongoSandboxInstance.updateOne(
    {
      provider: params.provider,
      sandboxId: params.sandboxId,
      $or: [{ teamId: { $exists: false } }, { teamId: null }]
    },
    { $set: { teamId: params.teamId } }
  );
}

// ---- 迁移维护：按「缺失 teamId」条件读写实例记录（经 interface/migration 暴露给系统迁移） ----

/** 迁移扫描的最小文档形态。 */
export type SandboxInstanceMissingTeamIdRecord = {
  _id: Types.ObjectId;
  sourceType: string;
  sourceId: string;
};

const missingTeamIdFilter = { $or: [{ teamId: { $exists: false } }, { teamId: null }] };
const missingTeamIdProjection = { projection: { _id: 1, sourceType: 1, sourceId: 1 } };

/** 迁移用：仍缺失 teamId 的记录的最大 _id（无记录时为 null）。 */
export async function getSandboxInstanceMissingTeamIdSnapshotEnd() {
  const last = await MongoSandboxInstance.collection.findOne(missingTeamIdFilter, {
    projection: { _id: 1 },
    sort: { _id: -1 }
  });
  return last ? String(last._id) : null;
}

/** 迁移用：按 ObjectId 游标分批读取缺失 teamId 的实例记录。 */
export function readSandboxInstancesMissingTeamId(params: {
  lastId: string | null;
  endId: string;
  limit: number;
}) {
  return MongoSandboxInstance.collection
    .find(
      {
        ...missingTeamIdFilter,
        _id: {
          ...(params.lastId ? { $gt: new Types.ObjectId(params.lastId) } : {}),
          $lte: new Types.ObjectId(params.endId)
        }
      },
      missingTeamIdProjection
    )
    .sort({ _id: 1 })
    .limit(params.limit)
    .toArray() as Promise<SandboxInstanceMissingTeamIdRecord[]>;
}

/** 迁移用：读取单条仍缺失 teamId 的实例；已被修复或删除时返回 null。 */
export function findSandboxInstanceMissingTeamId(recordId: string) {
  return MongoSandboxInstance.collection.findOne(
    { _id: new Types.ObjectId(recordId), ...missingTeamIdFilter },
    missingTeamIdProjection
  ) as Promise<SandboxInstanceMissingTeamIdRecord | null>;
}

/** 迁移用：仍缺失 teamId 的实例总数（包含不可回填的孤儿记录）。 */
export function countSandboxInstancesMissingTeamId() {
  return MongoSandboxInstance.collection.countDocuments(missingTeamIdFilter);
}

/** 迁移用：批量 CAS 回填 teamId；过滤条件携带「仍缺失」状态，只补不覆写、重放幂等。 */
export async function backfillSandboxInstanceTeamIdsBatch(
  items: Array<{ _id: Types.ObjectId; teamId: string }>
) {
  if (items.length === 0) return;
  await mongoSessionRun((session) =>
    MongoSandboxInstance.collection.bulkWrite(
      items.map((item) => ({
        updateOne: {
          filter: { _id: item._id, ...missingTeamIdFilter },
          update: { $set: { teamId: item.teamId } }
        }
      })),
      { session, ordered: false }
    )
  );
}

/** 在 archived 稳定态内原子切换 provider，不引入无远端副作用的过渡 operation。 */
export async function switchArchivedSandboxProvider(params: {
  resource: SandboxResourceRef;
  provider: SandboxProviderType;
  image?: SandboxInstanceSchemaType['image'];
}) {
  return MongoSandboxInstance.findOneAndUpdate(
    {
      ...buildSandboxResourceRecordFilter(params.resource),
      provider: params.resource.provider,
      sandboxId: params.resource.sandboxId,
      status: SandboxInstanceStatusEnum.archived,
      operation: { $exists: false }
    },
    {
      $set: {
        provider: params.provider,
        lastActiveAt: new Date(),
        ...(params.image ? { image: params.image } : {})
      }
    },
    { new: true }
  ).lean<SandboxResourceDoc | null>();
}

/** 在 running 稳定态更新业务归属或稳定字段，不允许唤醒过渡态。 */
export async function updateSandboxInstanceRecordBySandboxId(
  params: {
    provider?: SandboxProviderType;
    sandboxId: string;
    sourceType: ChatSourceTypeEnum;
    sourceId: string;
    userId: string;
    touchActive?: boolean;
  } & SandboxStableFields
): Promise<SandboxInstanceSchemaType | null> {
  return MongoSandboxInstance.findOneAndUpdate(
    {
      sandboxId: params.sandboxId,
      ...(params.provider ? { provider: params.provider } : {}),
      ...(params.touchActive
        ? {
            status: SandboxInstanceStatusEnum.running,
            operation: { $exists: false }
          }
        : {})
    },
    {
      $set: {
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        userId: params.userId,
        ...buildSandboxStableFieldsSet(params),
        ...(params.touchActive ? { lastActiveAt: new Date() } : {})
      }
    },
    { new: true }
  );
}

export async function findSandboxInstanceBySandboxIdAndTeam(params: {
  provider?: SandboxProviderType;
  sandboxId: string;
  teamId: string;
}) {
  return MongoSandboxInstance.findOne({
    sandboxId: params.sandboxId,
    ...(params.provider ? { provider: params.provider } : {}),
    teamId: params.teamId
  });
}

export async function findSandboxResourceBySandboxIdAndTeam(params: {
  provider?: SandboxProviderType;
  sandboxId: string;
  teamId: string;
}) {
  return MongoSandboxInstance.findOne({
    sandboxId: params.sandboxId,
    ...(params.provider ? { provider: params.provider } : {}),
    teamId: params.teamId
  }).lean<SandboxResourceDoc | null>();
}

export async function findSkillRelatedSandboxResources(skillIds: string[]) {
  return MongoSandboxInstance.find({
    sourceType: ChatSourceTypeEnum.skillEdit,
    sourceId: { $in: skillIds }
  }).lean<SandboxResourceDoc[]>();
}
