/**
 * Sandbox 实例原子层。
 *
 * Repository 只负责 v2 记录查询和 `status + operation.id` CAS，不执行任何远端副作用。
 */
import { randomUUID } from 'node:crypto';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { SANDBOX_WORKSPACE_VOLUME_NAME } from '@fastgpt/global/core/ai/sandbox/volume';
import { MongoSandboxInstance } from './schema';
import {
  SandboxInstanceStatusEnum,
  SandboxOperationTypeEnum,
  type SandboxInstanceSchemaType,
  type SandboxInstanceStatusType,
  type SandboxOperationType,
  type SandboxProviderType,
  type SandboxSourceType,
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
  if (
    sourceType === ChatSourceTypeEnum.app ||
    sourceType === ChatSourceTypeEnum.workflowBuilder ||
    sourceType === ChatSourceTypeEnum.skillEdit
  ) {
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

export async function countRunningSandboxInstancesBySourceType(
  sourceType: ChatSourceTypeEnum,
  provider?: SandboxProviderType
) {
  return MongoSandboxInstance.countDocuments({
    ...(provider ? { provider } : {}),
    sourceType,
    status: SandboxInstanceStatusEnum.running,
    operation: { $exists: false }
  });
}

type ClaimSandboxMigrationTargetParams = {
  provider: SandboxProviderType;
  sandboxId: string;
  sourceType: SandboxSourceType;
  sourceId: string;
  userId: string;
  reclaimHeartbeatBefore?: Date;
} & SandboxStableFields;

/** 创建或接管 Legacy migration 目标；调用方必须已经持有 Source 与 Lifecycle lease。 */
async function claimSandboxMigrationTarget(params: ClaimSandboxMigrationTargetParams) {
  const existing = await findSandboxInstanceBySource({
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    userId: params.userId
  });

  if (!existing) {
    const now = new Date();
    try {
      const created = await MongoSandboxInstance.create({
        provider: params.provider,
        sandboxId: params.sandboxId,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        userId: params.userId,
        status: SandboxInstanceStatusEnum.legacyMigrating,
        lastActiveAt: now,
        createdAt: now,
        ...buildSandboxStableFieldsSet(params),
        operation: {
          id: randomUUID(),
          type: SandboxOperationTypeEnum.legacyMigration,
          phase: 'claimed',
          startedAt: now,
          heartbeatAt: now
        }
      });
      return created.toObject() as SandboxResourceDoc;
    } catch (error) {
      if (!isMongoDuplicateKeyError(error)) throw error;
      return null;
    }
  }
  if (existing.sandboxId !== params.sandboxId) {
    throw new Error('Sandbox migration target conflicts with another sandbox');
  }
  if (
    !stableStatuses.has(existing.status) &&
    existing.status !== SandboxInstanceStatusEnum.legacyMigrating
  ) {
    return null;
  }
  if (
    existing.status === SandboxInstanceStatusEnum.legacyMigrating &&
    params.reclaimHeartbeatBefore
  ) {
    const operation = existing.operation;
    if (
      !operation?.error &&
      (!operation?.heartbeatAt || operation.heartbeatAt >= params.reclaimHeartbeatBefore)
    ) {
      return null;
    }
  }

  const claimed = await claimSandboxOperation({
    resource: existing,
    status: SandboxInstanceStatusEnum.legacyMigrating,
    type: SandboxOperationTypeEnum.legacyMigration,
    previousStatus: stableStatuses.has(existing.status)
      ? (existing.status as SandboxStableStatusType)
      : existing.operation?.previousStatus
  });
  if (!claimed) return claimed;

  return MongoSandboxInstance.findOneAndUpdate(
    {
      _id: claimed._id,
      status: SandboxInstanceStatusEnum.legacyMigrating,
      'operation.id': claimed.operation?.id
    },
    { $set: buildSandboxStableFieldsSet(params) },
    { new: true }
  ).lean<SandboxResourceDoc | null>();
}

/** 创建或接管 App 用户级 Legacy migration 目标。 */
export const claimAppSandboxMigrationTarget = (
  params: Omit<ClaimSandboxMigrationTargetParams, 'sourceType'>
) =>
  claimSandboxMigrationTarget({
    ...params,
    sourceType: ChatSourceTypeEnum.app
  });

/** 创建或接管使用新物理 ID 的 Skill Edit Legacy migration 目标。 */
export const claimSkillSandboxMigrationTarget = (
  params: Omit<ClaimSandboxMigrationTargetParams, 'sourceType' | 'userId'>
) =>
  claimSandboxMigrationTarget({
    ...params,
    sourceType: ChatSourceTypeEnum.skillEdit,
    userId: ChatSourceTypeEnum.skillEdit
  });

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
