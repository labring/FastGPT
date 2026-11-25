/**
 * Sandbox 实例原子层。
 *
 * Repository 只负责 v3 记录查询和 `status + operation.id` CAS，以及只读查询 v2/迁移状态用于门禁与对账保护，不执行任何远端副作用。
 */
import type { MongoDeleteResult } from '../../../../../common/mongo';
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
import {
  sandboxMigrationId,
  systemMigrationStateCollectionName,
  SystemMigrationStatusEnum
} from '@fastgpt/global/migration/constants';
import { SANDBOX_WORKSPACE_VOLUME_NAME } from '@fastgpt/global/core/ai/sandbox/volume';
import { getLegacySandboxInstanceCollection, MongoSandboxInstance } from './schema';
import {
  SANDBOX_PROVIDER,
  type SandboxInstanceSchemaType,
  type SandboxInstanceStatusType,
  type SandboxOperationType,
  type SandboxProviderType,
  type SandboxStableStatusType
} from '../../type';

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
    | 'provider'
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
  previousStatus?: SandboxStableStatusType;
  matchLastActiveAt?: boolean;
  matchInstanceIdentity?: boolean;
};

const getWorkspaceClaimName = (storage?: SandboxResourceRef['storage']) =>
  storage?.volumes?.find((volume) => volume.name === SANDBOX_WORKSPACE_VOLUME_NAME)?.claimName;

const buildWorkspaceClaimFilter = (claimName?: string) =>
  claimName
    ? {
        'storage.volumes': {
          $elemMatch: {
            name: SANDBOX_WORKSPACE_VOLUME_NAME,
            claimName
          }
        }
      }
    : {};

const buildRunningInstanceIdentityFilter = (resource: SandboxResourceRef) => ({
  ...(resource.instanceId
    ? { instanceId: resource.instanceId }
    : { instanceId: { $in: [null, ''] } }),
  ...buildWorkspaceClaimFilter(getWorkspaceClaimName(resource.storage))
});

const isMongoDuplicateKeyError = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 11000;

const buildSandboxResourceRecordFilter = (resource: SandboxResourceRef) =>
  resource._id !== undefined
    ? { _id: resource._id }
    : { provider: resource.provider ?? SANDBOX_PROVIDER, sandboxId: resource.sandboxId };

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

const hasMongoPathConflict = (a: string, b: string): boolean =>
  a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);

/**
 * 规整 `$set` / `$unset`，避免祖先或子孙路径同时出现在两处触发 Mongo 路径冲突。
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

  const unsetDoc: Record<string, ''> = {};
  for (const field of unset) {
    if (setKeys.some((setKey) => hasMongoPathConflict(field, setKey))) continue;
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
    previousStatus,
    matchLastActiveAt = false,
    matchInstanceIdentity = false
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

  return MongoSandboxInstance.findOneAndUpdate(
    {
      ...buildSandboxResourceRecordFilter(resource),
      ...(resource.status ? { status: resource.status } : {}),
      ...buildCurrentOperationFilter(resource),
      ...(matchLastActiveAt && resource.lastActiveAt
        ? { lastActiveAt: resource.lastActiveAt }
        : {}),
      ...(matchInstanceIdentity && resource.status === SandboxInstanceStatusEnum.running
        ? buildRunningInstanceIdentityFilter(resource)
        : {})
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
}): Promise<MongoDeleteResult> {
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
      ...buildWorkspaceClaimFilter(params.expectedWorkspaceClaimName)
    },
    {
      $set: {
        lastActiveAt: new Date()
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

/** 流式读取 stopped 归档候选（v3 集合仅包含 `/home/sandbox` 布局的 opensandbox 实例）。 */
export function createSandboxResourcesToArchiveCursor(inactiveBefore: Date) {
  return MongoSandboxInstance.find({
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
  /** 已进入幂等回滚的阶段可以每轮重试；调用方仍须取得租约并重新读取记录。 */
  retryPhases?: readonly string[];
  now?: Date;
}) {
  const heartbeatFilter = { 'operation.heartbeatAt': { $lte: params.heartbeatBefore } };
  return MongoSandboxInstance.find({
    status: { $in: params.statuses },
    $or: [
      { ...heartbeatFilter, 'operation.retryAfter': { $exists: false } },
      { 'operation.retryAfter': { $lte: params.now ?? new Date() } },
      ...(params.retryPhases?.length
        ? [
            {
              'operation.phase': { $in: params.retryPhases },
              'operation.retryAfter': { $exists: false }
            }
          ]
        : [])
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
    provider: SANDBOX_PROVIDER,
    sandboxId: params.sandboxId,
    ...(params.status ? { status: params.status } : {})
  }).lean<SandboxResourceDoc | null>();
}

export async function findSandboxInstanceBySandboxIdAndSource(params: {
  sandboxId: string;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  status?: SandboxInstanceStatusType;
}) {
  return MongoSandboxInstance.findOne({
    provider: SANDBOX_PROVIDER,
    sandboxId: params.sandboxId,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    ...(params.status ? { status: params.status } : {})
  }).lean<SandboxResourceDoc | null>();
}

export async function existsSandboxInstanceBySandboxId(params: { sandboxId: string }) {
  return Boolean(
    await MongoSandboxInstance.exists({
      provider: SANDBOX_PROVIDER,
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
 * `v3` 集合仅包含 opensandbox 实例（忽略 sourceType；未迁移的 4.17.x `v2` 记录不占新池配额），
 * 计数包含 provisioning/restoring 等过渡态，因此不能按 operation 是否存在过滤。
 * 缺失 teamId 的历史记录不计入任何团队，但仍计入系统总量。
 */
export async function countActiveSandboxInstances(params: { teamId?: string } = {}) {
  return MongoSandboxInstance.countDocuments({
    status: { $in: [...sandboxActiveStatusList] },
    ...(params.teamId ? { teamId: params.teamId } : {})
  });
}

/** 只为历史缺失 teamId 的记录补齐归属；已有 teamId 的记录绝不覆写。 */
export async function backfillSandboxInstanceTeamId(params: { sandboxId: string; teamId: string }) {
  return MongoSandboxInstance.updateOne(
    {
      provider: SANDBOX_PROVIDER,
      sandboxId: params.sandboxId,
      $or: [{ teamId: { $exists: false } }, { teamId: null }]
    },
    { $set: { teamId: params.teamId } }
  );
}

/** 批量按逻辑 `sandboxId` 查询 v3 记录，供孤儿容器反向对账 GC 使用。 */
export async function findSandboxInstancesBySandboxIds(sandboxIds: string[]) {
  if (sandboxIds.length === 0) return [];
  return MongoSandboxInstance.find({
    provider: SANDBOX_PROVIDER,
    sandboxId: { $in: sandboxIds }
  }).lean<SandboxResourceDoc[]>();
}

/** 批量按逻辑 `sandboxId` 只读查询 v2 遗留记录，仅用于孤儿容器反向对账保护未迁移实例。 */
export async function findLegacySandboxInstancesBySandboxIds(
  sandboxIds: string[]
): Promise<SandboxResourceDoc[]> {
  if (sandboxIds.length === 0) return [];
  const rows = await getLegacySandboxInstanceCollection()
    .find({ sandboxId: { $in: sandboxIds } })
    .toArray();
  return rows as unknown as SandboxResourceDoc[];
}

/** 按逻辑 `sandboxId` 只读查询单条 v2 遗留记录，仅用于孤儿容器反向对账锁内复核。 */
export async function findLegacySandboxInstanceBySandboxId(params: {
  sandboxId: string;
}): Promise<SandboxResourceDoc | null> {
  const row = await getLegacySandboxInstanceCollection().findOne({
    sandboxId: params.sandboxId
  });
  return (row as unknown as SandboxResourceDoc | null) ?? null;
}

/**
 * 判断 source 是否仍在 v2 中持有尚未迁移完成的遗留实例。
 *
 * - 若 v2 无匹配且非 `deleting` 的记录，直接放行；
 * - 若 v2 存在非 `deleting` 记录且 `20261117_migrate_sandbox_to_opensandbox` 尚未成功完成，
 *   返回 `true` 以触发 409 门禁阻断，避免在 v3 误建空白同名沙盒导致数据割裂；
 * - 一旦迁移任务已 `succeeded`（即便尚未执行 Step 8 清理 v2），若用户随后主动删除了 v3 记录，再次创建应放行。
 */
export async function hasPendingLegacySandboxInstance(params: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId?: string;
}): Promise<boolean> {
  const legacyDoc = await getLegacySandboxInstanceCollection().findOne(
    {
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      ...(params.userId !== undefined ? { userId: params.userId } : {}),
      status: { $ne: SandboxInstanceStatusEnum.deleting }
    },
    { projection: { _id: 1 } }
  );
  if (!legacyDoc) return false;

  const migrationSucceeded = await MongoSandboxInstance.db
    .collection(systemMigrationStateCollectionName)
    .findOne(
      {
        _id: sandboxMigrationId as never,
        status: SystemMigrationStatusEnum.succeeded
      },
      { projection: { _id: 1 } }
    );
  return !migrationSucceeded;
}

type VolumeClaimRow = { storage?: { volumes?: Array<{ claimName?: string }> } | null };

/** 查询给定持久卷名中仍被 v3 或只读 v2 实例记录引用的集合，供孤儿持久卷反向对账 GC 保护未迁移 PVC。 */
export async function findExistingSandboxVolumeClaimNames(
  claimNames: string[]
): Promise<Set<string>> {
  if (claimNames.length === 0) return new Set();
  const targetSet = new Set(claimNames);
  const filter = { 'storage.volumes.claimName': { $in: claimNames } };
  const projection = { 'storage.volumes.claimName': 1 };

  const [v3Rows, v2Rows] = await Promise.all([
    MongoSandboxInstance.find(filter, projection).lean<VolumeClaimRow[]>(),
    getLegacySandboxInstanceCollection().find(filter, { projection }).toArray() as Promise<
      VolumeClaimRow[]
    >
  ]);

  const matched = new Set<string>();
  for (const row of [...v3Rows, ...v2Rows]) {
    for (const volume of row.storage?.volumes ?? []) {
      if (volume.claimName && targetSet.has(volume.claimName)) {
        matched.add(volume.claimName);
      }
    }
  }
  return matched;
}

/** 在 running 稳定态更新业务归属或稳定字段，不允许唤醒或污染过渡态。 */
export async function updateSandboxInstanceRecordBySandboxId(
  params: {
    sandboxId: string;
    sourceType: ChatSourceTypeEnum;
    sourceId: string;
    userId: string;
    touchActive?: boolean;
  } & SandboxStableFields
): Promise<SandboxResourceDoc | null> {
  return MongoSandboxInstance.findOneAndUpdate(
    {
      provider: SANDBOX_PROVIDER,
      sandboxId: params.sandboxId,
      status: SandboxInstanceStatusEnum.running,
      operation: { $exists: false }
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
  ).lean<SandboxResourceDoc | null>();
}

export async function findSkillRelatedSandboxResources(skillIds: string[]) {
  return MongoSandboxInstance.find({
    sourceType: ChatSourceTypeEnum.skillEdit,
    sourceId: { $in: skillIds }
  }).lean<SandboxResourceDoc[]>();
}
