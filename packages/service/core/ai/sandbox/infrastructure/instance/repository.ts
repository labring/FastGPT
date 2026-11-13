/**
 * Sandbox 实例原子层。
 *
 * Repository 只负责 v3 记录查询和 `status + operation.id` CAS，不执行任何远端副作用。
 */
import {
  sandboxActiveStatusList,
  expectedOperationByStatus,
  SandboxInstanceStatusEnum,
  SandboxOperationTypeEnum
} from '../../constants';
import { randomUUID } from 'node:crypto';
import type { ClientSession } from '../../../../../common/mongo';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { isSandboxSourceType } from '@fastgpt/global/common/chat/source';
import { SANDBOX_WORKSPACE_VOLUME_NAME } from '@fastgpt/global/core/ai/sandbox/volume';
import { MongoSandboxInstance } from './schema';
import {
  type SandboxContextType,
  type SandboxInstanceSchemaType,
  type SandboxInstanceStatusType,
  type SandboxOperationType,
  type SandboxResourceLimitsType,
  type SandboxStableStatusType,
  type SandboxStorageType
} from '../../type';

export type SandboxResourceDoc = Pick<
  SandboxInstanceSchemaType,
  | 'sandboxId'
  | 'sourceType'
  | 'sourceId'
  | 'userId'
  | 'teamId'
  | 'status'
  | 'lastActiveAt'
  | 'resourceLimits'
  | 'storage'
  | 'instanceId'
  | 'image'
  | 'context'
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
    | 'context'
    | 'storage'
    | 'operation'
  >
> & {
  sandboxId: string;
  _id?: unknown;
};

type SandboxSourceParams = {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId?: string;
};

type ClaimSandboxOperationParams = {
  resource: SandboxResourceRef;
  status: Exclude<SandboxInstanceStatusType, SandboxStableStatusType>;
  type: SandboxOperationType;
  phase?: string;
  set?: Record<string, unknown>;
  matchLastActiveAt?: boolean;
};

const isMongoDuplicateKeyError = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === 11000;

const buildSandboxResourceRecordFilter = (resource: SandboxResourceRef) =>
  resource._id !== undefined ? { _id: resource._id } : { sandboxId: resource.sandboxId };

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

type SandboxStableFields = Partial<Pick<SandboxInstanceSchemaType, 'teamId' | 'image'>> & {
  context?: SandboxContextType;
};

/**
 * 将局部更新字段规整为 Mongo `$set` 载荷。
 *
 * 对 `context` 统一展开为点路径 `'context.skillVersionId'`，避免后续在 `context` 内扩展同级字段时被整块覆写。
 */
const normalizeSandboxUpdateSet = (set?: Record<string, unknown>): Record<string, unknown> => {
  if (!set) return {};
  const { context, ...rest } = set;
  const normalized: Record<string, unknown> = { ...rest };
  if (context !== null && context !== undefined && typeof context === 'object') {
    const { skillVersionId } = context as SandboxContextType;
    if (skillVersionId !== undefined) {
      normalized['context.skillVersionId'] = skillVersionId;
    }
  }
  return normalized;
};

const buildSandboxStableFieldsSet = (fields: SandboxStableFields) =>
  normalizeSandboxUpdateSet({
    ...(fields.teamId !== undefined ? { teamId: fields.teamId } : {}),
    ...(fields.image !== undefined ? { image: fields.image } : {}),
    ...(fields.context !== undefined ? { context: fields.context } : {})
  });

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
  const { resource, status, type, phase, set, matchLastActiveAt = false } = params;
  assertOperationMatchesStatus(status, type);
  const now = new Date();
  const operationId = randomUUID();
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
        ...normalizeSandboxUpdateSet(set),
        status,
        operation: {
          id: operationId,
          type,
          phase: nextPhase,
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
        ...normalizeSandboxUpdateSet(params.set),
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

/** 保留过渡态并记录最近一次错误，释放 Lifecycle Lease 后允许后续请求立即按阶段恢复。 */
export async function markSandboxOperationFailed(params: {
  resource: SandboxResourceRef;
  operationId: string;
  status: Exclude<SandboxInstanceStatusType, SandboxStableStatusType>;
  error: string;
}) {
  const now = new Date();
  return MongoSandboxInstance.updateOne(
    {
      ...buildSandboxResourceRecordFilter(params.resource),
      status: params.status,
      'operation.id': params.operationId
    },
    {
      $set: {
        'operation.failedAt': now,
        'operation.error': params.error,
        'operation.heartbeatAt': now
      }
    }
  );
}

/**
 * 按 operation token 提交稳定态并清除临时 operation。
 *
 * `findOneAndUpdate` 默认不触发 Mongoose 文档 `pre('validate')` 钩子，因此在提交边界显式守卫：
 * - `running` 必须具备非空 `instanceId`；
 * - `stopped` 必须清空 `instanceId`（禁止在 `set` 中同时写入 `instanceId`）。
 */
export async function completeSandboxOperation(params: {
  resource: SandboxResourceRef;
  operationId: string;
  fromStatus: Exclude<SandboxInstanceStatusType, SandboxStableStatusType>;
  status: SandboxStableStatusType;
  set?: Record<string, unknown>;
  touchActive?: boolean;
}) {
  const normalizedSet = normalizeSandboxUpdateSet(params.set);

  if (params.status === SandboxInstanceStatusEnum.running) {
    const candidateInstanceId =
      normalizedSet.instanceId !== undefined
        ? normalizedSet.instanceId
        : params.resource.instanceId;
    if (typeof candidateInstanceId !== 'string' || candidateInstanceId.trim().length === 0) {
      throw new Error('Running status requires a non-empty instanceId');
    }
  }
  if (params.status === SandboxInstanceStatusEnum.stopped && 'instanceId' in normalizedSet) {
    if (normalizedSet.instanceId !== undefined && normalizedSet.instanceId !== null) {
      throw new Error('Stopped status must not keep an instanceId');
    }
    delete normalizedSet.instanceId;
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
        ...normalizedSet
      },
      $unset: {
        operation: '',
        ...(params.status === SandboxInstanceStatusEnum.stopped ? { instanceId: '' } : {})
      }
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

/**
 * 清理尚未分配任何远端资源（仍停留在 `provisioning + claimed`）的占位记录。
 *
 * 仅用于首次插入记录后执行 Store-Load 屏障复检发现业务 source 已被软删除时的原子回撤。
 */
export async function deleteUnprovisionedSandboxRecord(params: {
  resource: SandboxResourceRef;
  operationId: string;
}) {
  return MongoSandboxInstance.deleteOne({
    ...buildSandboxResourceRecordFilter(params.resource),
    status: SandboxInstanceStatusEnum.provisioning,
    'operation.id': params.operationId,
    'operation.phase': 'claimed'
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
    storage?: SandboxStorageType | null;
    resourceLimits?: SandboxResourceLimitsType | null;
  } & SandboxStableFields
) {
  const now = new Date();
  const operationId = randomUUID();

  try {
    const created = await MongoSandboxInstance.create({
      sandboxId: params.sandboxId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      userId: params.userId,
      teamId: params.teamId,
      status: SandboxInstanceStatusEnum.provisioning,
      lastActiveAt: now,
      createdAt: now,
      ...(params.storage !== undefined && params.storage !== null
        ? { storage: params.storage }
        : {}),
      ...(params.resourceLimits !== undefined && params.resourceLimits !== null
        ? { resourceLimits: params.resourceLimits }
        : {}),
      ...(params.image !== undefined ? { image: params.image } : {}),
      ...(params.context?.skillVersionId !== undefined
        ? { context: { skillVersionId: params.context.skillVersionId } }
        : {}),
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
    const existing =
      (await findSandboxInstanceBySource({
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        userId: params.userId
      })) ??
      (await MongoSandboxInstance.findOne({
        sandboxId: params.sandboxId
      }).lean<SandboxResourceDoc | null>());
    return { instance: existing, created: false };
  }
}

/**
 * 仅刷新已经发布的 running 记录；不存在或处于过渡态时绝不 upsert。
 *
 * OpenSandbox 可传入预期 workspace claimName 做 CAS，防止 lease 外构造的旧 client 在重建
 * 提交新 generation 后继续命中快路径。storage 只能由 lifecycle checkpoint 写入，touch 不回写。
 */
export async function touchRunningSandboxInstance(params: {
  sandboxId: string;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  expectedWorkspaceClaimName?: string;
  resourceLimits?: SandboxResourceLimitsType;
}) {
  return MongoSandboxInstance.findOneAndUpdate(
    {
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
        ...(params.resourceLimits ? { resourceLimits: params.resourceLimits } : {})
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

/**
 * 批量刷新指定运行态沙盒实例的 `lastActiveAt`（供 `opensandbox-proxy` 60s 周期保活调用）。
 * 仅命中无在途生命周期操作且处于 `running` 的记录，绝不隐式唤醒已停止实例或打断 stop/delete 流程。
 */
export async function touchRunningSandboxInstancesByIds(params: {
  sandboxIds: string[];
}): Promise<number> {
  const uniqueIds = Array.from(new Set(params.sandboxIds.filter((id) => id.trim() !== '')));
  if (uniqueIds.length === 0) {
    return 0;
  }

  const result = await MongoSandboxInstance.updateMany(
    {
      sandboxId: { $in: uniqueIds },
      status: SandboxInstanceStatusEnum.running,
      operation: { $exists: false }
    },
    {
      $set: {
        lastActiveAt: new Date()
      }
    }
  );
  return result.modifiedCount ?? 0;
}

/** 查询超过心跳阈值或已处于回滚阶段、可由后台恢复任务尝试接管的过渡态记录。 */
export async function findStaleSandboxOperations(params: {
  statuses: Exclude<SandboxInstanceStatusType, SandboxStableStatusType>[];
  heartbeatBefore: Date;
  /** 已进入幂等回滚的阶段可每轮尝试恢复；在途活跃任务仍由 Redis Lifecycle Lease 非阻塞跳过。 */
  retryPhases?: readonly string[];
}) {
  const heartbeatFilter = { 'operation.heartbeatAt': { $lte: params.heartbeatBefore } };
  return MongoSandboxInstance.find({
    status: { $in: params.statuses },
    ...(params.retryPhases?.length
      ? {
          $or: [heartbeatFilter, { 'operation.phase': { $in: params.retryPhases } }]
        }
      : heartbeatFilter)
  }).lean<SandboxResourceDoc[]>();
}

/** 按业务归属（sourceType + sourceId + 可选 userId）查询关联的全部沙盒资源记录。 */
export async function findSandboxResourcesBySource(params: SandboxSourceParams) {
  return MongoSandboxInstance.find(buildSandboxResourceSourceQuery(params)).lean<
    SandboxResourceDoc[]
  >();
}

/** 按逻辑 sandboxId（及可选 status）查询单条沙盒记录。 */
export async function findSandboxInstanceBySandboxId(params: {
  sandboxId: string;
  status?: SandboxInstanceStatusType;
}) {
  return MongoSandboxInstance.findOne({
    sandboxId: params.sandboxId,
    ...(params.status ? { status: params.status } : {})
  }).lean<SandboxResourceDoc | null>();
}

/** 按逻辑 sandboxId 与业务归属（sourceType + sourceId）联合查询沙盒记录。 */
export async function findSandboxInstanceBySandboxIdAndSource(params: {
  sandboxId: string;
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  status?: SandboxInstanceStatusType;
}) {
  return MongoSandboxInstance.findOne({
    sandboxId: params.sandboxId,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    ...(params.status ? { status: params.status } : {})
  }).lean<SandboxResourceDoc | null>();
}

/** 判断指定逻辑 sandboxId 的实例记录是否存在。 */
export async function existsSandboxInstanceBySandboxId(params: { sandboxId: string }) {
  return Boolean(await MongoSandboxInstance.exists(params));
}

/** 按业务唯一键（sourceType + sourceId + userId）查询单条沙盒实例记录。 */
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
 * provisioning/stopping 等过渡态，因此不能按 operation 是否存在过滤。
 */
export async function countActiveSandboxInstances(params: { teamId?: string } = {}) {
  return MongoSandboxInstance.countDocuments({
    status: { $in: [...sandboxActiveStatusList] },
    ...(params.teamId ? { teamId: params.teamId } : {})
  });
}

/** 在 stopped 稳定态更新目标镜像配置。 */
export async function updateStoppedSandboxImage(params: {
  resource: SandboxResourceRef;
  image?: SandboxInstanceSchemaType['image'];
}) {
  return MongoSandboxInstance.findOneAndUpdate(
    {
      ...buildSandboxResourceRecordFilter(params.resource),
      sandboxId: params.resource.sandboxId,
      status: SandboxInstanceStatusEnum.stopped,
      operation: { $exists: false }
    },
    {
      $set: {
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
    sandboxId: string;
    sourceType: ChatSourceTypeEnum;
    sourceId: string;
    userId: string;
    touchActive?: boolean;
    session?: ClientSession;
  } & SandboxStableFields
): Promise<SandboxInstanceSchemaType | null> {
  return MongoSandboxInstance.findOneAndUpdate(
    {
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
    {
      new: true,
      ...(params.session ? { session: params.session } : {})
    }
  ).lean<SandboxInstanceSchemaType | null>();
}

/** 批量查询指定技能 ID 列表关联的 Skill Edit 沙盒资源记录。 */
export async function findSkillRelatedSandboxResources(skillIds: string[]) {
  return MongoSandboxInstance.find({
    sourceType: ChatSourceTypeEnum.skillEdit,
    sourceId: { $in: skillIds }
  }).lean<SandboxResourceDoc[]>();
}

/** 批量按 sandboxId 查询实例状态，供反向沙盒容器对账 GC 使用。 */
export async function findSandboxInstancesBySandboxIds(params: { sandboxIds: string[] }) {
  if (params.sandboxIds.length === 0) return [];
  return MongoSandboxInstance.find({
    sandboxId: { $in: params.sandboxIds }
  }).lean<SandboxResourceDoc[]>();
}

/** 批量查询当前仍被任意 Mongo 沙盒记录持有的持久卷 claimName 集合，供孤儿卷对账 GC 使用。 */
export async function findExistingSandboxVolumeClaimNames(
  claimNames: string[]
): Promise<Set<string>> {
  if (claimNames.length === 0) return new Set();
  const docs = await MongoSandboxInstance.find({
    'storage.volumes.claimName': { $in: claimNames }
  })
    .select('storage')
    .lean<Pick<SandboxResourceDoc, 'storage'>[]>();

  const existing = new Set<string>();
  for (const doc of docs) {
    for (const vol of doc.storage?.volumes ?? []) {
      if (vol.claimName) {
        existing.add(vol.claimName);
      }
    }
  }
  return existing;
}
