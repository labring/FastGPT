/**
 * Sandbox 实例原子层。
 *
 * Repository 只负责 v2 记录查询和 `status + operation.id` CAS，不执行任何远端副作用。
 */
import {
  SANDBOX_ARCHIVE_CURSOR_BATCH_SIZE,
  sandboxActiveStatusList,
  sandboxStableStatusList,
  expectedOperationByStatus,
  SandboxInstanceStatusEnum,
  SandboxOperationTypeEnum
} from '../../constants';
import { randomUUID } from 'node:crypto';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { isSandboxSourceType } from '@fastgpt/global/common/chat/source';
import { SANDBOX_WORKSPACE_VOLUME_NAME } from '@fastgpt/global/core/ai/sandbox/volume';
import { MongoSandboxInstance } from './schema';
import {
  SANDBOX_PROVIDER,
  type SandboxInstanceSchemaType,
  type SandboxInstanceStatusType,
  type SandboxOperationType,
  type SandboxProviderType,
  type SandboxStableStatusType
} from '../../type';
import { buildLegacySandboxProviderFilter } from '../../legacy';

const stableStatuses = new Set<SandboxInstanceStatusType>(sandboxStableStatusList);

export type SandboxResourceDoc = Pick<
  SandboxInstanceSchemaType,
  | 'provider'
  | 'instanceId'
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
    | 'instanceId'
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

export type SandboxUnsetField = 'instanceId' | 'storage.volumes' | 'storage.mountPath';

export type ClaimSandboxOperationParams = {
  resource: SandboxResourceRef;
  status: Exclude<SandboxInstanceStatusType, SandboxStableStatusType>;
  type: SandboxOperationType;
  phase?: string;
  set?: Record<string, unknown>;
  unset?: readonly SandboxUnsetField[];
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
  if (isSandboxSourceType(sourceType)) {
    return { sourceType, sourceId, ...(userId ? { userId } : {}) };
  }
  if (sourceType === ChatSourceTypeEnum.chatAgentHelper) {
    throw new Error('ChatAgentHelper source does not support sandbox resources');
  }

  const exhaustiveCheck: never = sourceType;
  throw new Error(`Unsupported sandbox source type: ${exhaustiveCheck}`);
};

type SandboxStableFields = Pick<
  SandboxInstanceSchemaType,
  'teamId' | 'instanceId' | 'image' | 'versionId'
>;

const buildSandboxStableFieldsSet = (fields: SandboxStableFields) => ({
  ...(fields.teamId !== undefined ? { teamId: fields.teamId } : {}),
  ...(fields.instanceId !== undefined ? { instanceId: fields.instanceId } : {}),
  ...(fields.image !== undefined ? { image: fields.image } : {}),
  ...(fields.versionId !== undefined ? { versionId: fields.versionId } : {})
});

/**
 * 规整 `$set` / `$unset`，避免 `storage` 与 `storage.*` 或 `instanceId` 同时出现在两处触发 Mongo 路径冲突。
 */
const buildSandboxUnsetFields = ({
  set,
  unset
}: {
  set?: Record<string, unknown>;
  unset?: readonly string[];
}): Record<string, ''> => {
  if (!unset?.length) return {};
  const setKeys = set ? Object.keys(set) : [];
  const hasStorageSet = setKeys.some((key) => key === 'storage' || key.startsWith('storage.'));
  const hasInstanceIdSet = set ? 'instanceId' in set : false;

  const unsetDoc: Record<string, ''> = {};
  for (const field of unset) {
    if (hasStorageSet && (field === 'storage' || field.startsWith('storage.'))) continue;
    if (hasInstanceIdSet && field === 'instanceId') continue;
    unsetDoc[field] = '';
  }
  return unsetDoc;
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
  const {
    resource,
    status,
    type,
    phase,
    set,
    unset,
    previousStatus,
    matchLastActiveAt = false
  } = params;
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
  const unsetDoc = buildSandboxUnsetFields({ set, unset });

  return MongoSandboxInstance.findOneAndUpdate(
    {
      ...buildSandboxResourceRecordFilter(resource),
      ...(resource.status ? { status: resource.status } : {}),
      ...buildCurrentOperationFilter(resource),
      ...(matchLastActiveAt && resource.lastActiveAt ? { lastActiveAt: resource.lastActiveAt } : {})
    },
    {
      $set: {
        ...(set ?? {}),
        status,
        operation: {
          id: operationId,
          type,
          phase: nextPhase,
          ...(derivedPreviousStatus ? { previousStatus: derivedPreviousStatus } : {}),
          startedAt: now,
          heartbeatAt: now
        }
      },
      ...(Object.keys(unsetDoc).length > 0 ? { $unset: unsetDoc } : {})
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
  unset?: readonly SandboxUnsetField[];
}) {
  const extraUnset = buildSandboxUnsetFields({ set: params.set, unset: params.unset });

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
        ...extraUnset,
        'operation.failedAt': '',
        'operation.retryAfter': '',
        'operation.error': ''
      }
    },
    { new: true }
  ).lean<SandboxResourceDoc | null>();
}

/** 在持有有效租约执行长耗时步骤期间刷新 operation 心跳，防止正常长任务超过孤儿接管阈值。 */
export async function touchSandboxOperationHeartbeat(params: {
  resource: SandboxResourceRef;
  operationId: string;
  status: Exclude<SandboxInstanceStatusType, SandboxStableStatusType>;
}) {
  return MongoSandboxInstance.updateOne(
    {
      ...buildSandboxResourceRecordFilter(params.resource),
      status: params.status,
      'operation.id': params.operationId
    },
    {
      $set: {
        'operation.heartbeatAt': new Date()
      }
    }
  );
}

/** 保留过渡态并记录错误，供同一操作重试或 stale recovery 接管。 */
export async function markSandboxOperationFailed(params: {
  resource: SandboxResourceRef;
  operationId: string;
  status: Exclude<SandboxInstanceStatusType, SandboxStableStatusType>;
  error: string;
  retryAfter: Date;
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
        'operation.retryAfter': params.retryAfter,
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
  unset?: readonly SandboxUnsetField[];
  touchActive?: boolean;
}) {
  const extraUnset = buildSandboxUnsetFields({ set: params.set, unset: params.unset });

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
      $unset: {
        ...extraUnset,
        operation: ''
      }
    },
    { new: true }
  ).lean<SandboxResourceDoc | null>();
}

/** 仅在当前 operation 仍持有 token 时删除记录（默认 deleting，也支持撤回尚未产生副作用的 provisioning 占位）。 */
export async function deleteClaimedSandboxRecord(params: {
  resource: SandboxResourceRef;
  operationId: string;
  status?: Exclude<SandboxInstanceStatusType, SandboxStableStatusType>;
}) {
  return MongoSandboxInstance.deleteOne({
    ...buildSandboxResourceRecordFilter(params.resource),
    status: params.status ?? SandboxInstanceStatusEnum.deleting,
    'operation.id': params.operationId
  });
}

/** 创建带团队归属的首次 provisioning 占位；唯一键冲突时返回已经存在的逻辑记录。 */
export async function createSandboxProvisioningInstance(
  params: {
    sandboxId: string;
    sourceType: ChatSourceTypeEnum;
    sourceId: string;
    userId: string;
    teamId: string;
    storage?: SandboxInstanceSchemaType['storage'];
    limit?: Partial<NonNullable<SandboxInstanceSchemaType['limit']>>;
  } & SandboxStableFields
) {
  const now = new Date();
  const operationId = randomUUID();

  try {
    const created = await MongoSandboxInstance.create({
      provider: SANDBOX_PROVIDER,
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
  sandboxId: string;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  expectedWorkspaceClaimName?: string;
  limit?: Partial<NonNullable<SandboxInstanceSchemaType['limit']>>;
}) {
  return MongoSandboxInstance.findOneAndUpdate(
    {
      provider: SANDBOX_PROVIDER,
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

/** 查询可被 stop cron 抢占的 running 记录（限定 opensandbox，避免误触未迁移 Devbox）。 */
export async function findInactiveRunningSandboxResources(inactiveBefore: Date) {
  return MongoSandboxInstance.find({
    provider: SANDBOX_PROVIDER,
    status: SandboxInstanceStatusEnum.running,
    lastActiveAt: { $lt: inactiveBefore },
    operation: { $exists: false }
  }).lean<SandboxResourceDoc[]>();
}

/** 流式读取 stopped 归档候选（限定 opensandbox）。 */
export function createSandboxResourcesToArchiveCursor(inactiveBefore: Date) {
  return MongoSandboxInstance.find({
    provider: SANDBOX_PROVIDER,
    status: SandboxInstanceStatusEnum.stopped,
    lastActiveAt: { $lt: inactiveBefore },
    operation: { $exists: false }
  })
    .sort({ lastActiveAt: -1 })
    .lean<SandboxResourceDoc>()
    .cursor({ batchSize: SANDBOX_ARCHIVE_CURSOR_BATCH_SIZE });
}

/** 查询超过隔离窗口、可由恢复任务接管的过渡态记录（限定 opensandbox）。 */
export async function findStaleSandboxOperations(params: {
  statuses: Exclude<SandboxInstanceStatusType, SandboxStableStatusType>[];
  heartbeatBefore: Date;
  /** 已进入幂等回滚的阶段可以每轮重试；调用方仍须取得租约并重新读取记录。 */
  retryPhases?: readonly string[];
  now?: Date;
}) {
  const heartbeatFilter = { 'operation.heartbeatAt': { $lte: params.heartbeatBefore } };
  return MongoSandboxInstance.find({
    provider: SANDBOX_PROVIDER,
    status: { $in: params.statuses },
    $or: [
      heartbeatFilter,
      { 'operation.retryAfter': { $lte: params.now ?? new Date() } },
      ...(params.retryPhases?.length ? [{ 'operation.phase': { $in: params.retryPhases } }] : [])
    ]
  }).lean<SandboxResourceDoc[]>();
}

export async function findSandboxResourcesBySource(params: SandboxSourceParams) {
  return MongoSandboxInstance.find(buildSandboxResourceSourceQuery(params)).lean<
    SandboxResourceDoc[]
  >();
}

export async function findSandboxInstanceBySandboxId(params: {
  sandboxId: string;
  status?: SandboxInstanceStatusType;
}) {
  return MongoSandboxInstance.findOne({
    provider: buildLegacySandboxProviderFilter(),
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
    provider: buildLegacySandboxProviderFilter(params.provider),
    sandboxId: params.sandboxId,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    ...(params.status ? { status: params.status } : {})
  }).lean<SandboxResourceDoc | null>();
}

export async function existsSandboxInstanceBySandboxId(params: { sandboxId: string }) {
  return Boolean(
    await MongoSandboxInstance.exists({
      provider: buildLegacySandboxProviderFilter(),
      sandboxId: params.sandboxId
    })
  );
}

export async function findSandboxInstanceBySource(params: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  status?: SandboxInstanceStatusType;
}) {
  return MongoSandboxInstance.findOne({
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
    provider: SANDBOX_PROVIDER,
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

/** 批量按逻辑 `sandboxId` 查询记录，供孤儿容器反向对账 GC 使用。 */
export async function findSandboxInstancesBySandboxIds(sandboxIds: string[]) {
  if (sandboxIds.length === 0) return [];
  return MongoSandboxInstance.find({
    provider: buildLegacySandboxProviderFilter(),
    sandboxId: { $in: sandboxIds }
  }).lean<SandboxResourceDoc[]>();
}

/** 查询给定持久卷名中仍被任何实例记录引用的集合，供孤儿持久卷反向对账 GC 使用。 */
export async function findExistingSandboxVolumeClaimNames(
  claimNames: string[]
): Promise<Set<string>> {
  if (claimNames.length === 0) return new Set();
  const targetSet = new Set(claimNames);
  const rows = await MongoSandboxInstance.find(
    { 'storage.volumes.claimName': { $in: claimNames } },
    { 'storage.volumes.claimName': 1 }
  ).lean<Array<{ storage?: { volumes?: Array<{ claimName?: string }> } | null }>>();

  const matched = new Set<string>();
  for (const row of rows) {
    for (const volume of row.storage?.volumes ?? []) {
      if (volume.claimName && targetSet.has(volume.claimName)) {
        matched.add(volume.claimName);
      }
    }
  }
  return matched;
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
      provider: buildLegacySandboxProviderFilter(params.provider),
      sandboxId: params.sandboxId,
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

export async function findSkillRelatedSandboxResources(skillIds: string[]) {
  return MongoSandboxInstance.find({
    sourceType: ChatSourceTypeEnum.skillEdit,
    sourceId: { $in: skillIds }
  }).lean<SandboxResourceDoc[]>();
}
