import { isValidObjectId } from 'mongoose';
import type { SandboxStatusType } from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import type { SandboxTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { MongoSandboxInstance } from './schema';
import type {
  SandboxArchiveStateType,
  SandboxInstanceSchemaType,
  SandboxProviderType
} from '../type';

/**
 * 可直接用于 stop/delete 的实例记录最小字段。
 *
 * 清理流程只依赖 provider 和 sandboxId，避免把完整 Mongo 文档泄漏到 resource service。
 */
export type SandboxResourceDoc = Pick<
  SandboxInstanceSchemaType,
  'provider' | 'sandboxId' | 'type' | 'status' | 'lastActiveAt' | 'metadata'
> & {
  _id: unknown;
};

export type SandboxResourceRef = {
  provider: SandboxProviderType;
  sandboxId: string;
  _id?: unknown;
};

const BUSY_ARCHIVE_STATES: SandboxArchiveStateType[] = ['archiving', 'restoring'];
const ACTIVE_ARCHIVE_STATES: SandboxArchiveStateType[] = ['archiving', 'archived', 'restoring'];
const RUNTIME_BLOCKED_ARCHIVE_STATES: SandboxArchiveStateType[] = ['archived', 'restoring'];

/**
 * 构造支持 sandboxId 或 Mongo ObjectId 的查询条件。
 *
 * 对外 API 允许用户传入展示用 sandboxId，也兼容部分历史接口传入实例 _id 的情况。
 */
export const buildSandboxInstanceLookup = (sandboxId: string) => ({
  $or: [{ sandboxId }, ...(isValidObjectId(sandboxId) ? [{ _id: sandboxId }] : [])]
});

const buildSandboxResourceRecordFilter = (resource: SandboxResourceRef) => {
  if (resource._id !== undefined) {
    return { _id: resource._id };
  }
  return {
    provider: resource.provider,
    sandboxId: resource.sandboxId
  };
};

/**
 * 记录运行态 sandbox 的最新活跃状态；不存在时创建会话归属和资源元信息。
 *
 * 这是运行态 client 唯一的实例写入口，避免业务层直接拼 Mongo upsert 细节。
 */
export async function upsertRunningSandboxInstance(params: {
  provider: SandboxProviderType;
  sandboxId: string;
  appId?: string;
  userId?: string;
  chatId?: string;
  storage?: SandboxInstanceSchemaType['storage'];
  limit?: Partial<NonNullable<SandboxInstanceSchemaType['limit']>>;
  metadata?: Record<string, unknown>;
}) {
  const { provider, sandboxId, appId, userId, chatId, storage, limit, metadata } = params;
  const archiveStateFilter = {
    $or: [
      { 'metadata.archive.state': { $exists: false } },
      { 'metadata.archive.state': { $nin: RUNTIME_BLOCKED_ARCHIVE_STATES } }
    ]
  };
  const runningUpdate = {
    $set: {
      status: SandboxStatusEnum.running,
      lastActiveAt: new Date()
    }
  };
  const existingUpdate = {
    ...runningUpdate,
    $unset: {
      'metadata.archive': ''
    }
  };
  const insertUpdate = {
    ...runningUpdate,
    $setOnInsert: {
      ...(appId !== undefined ? { appId } : {}),
      ...(userId !== undefined ? { userId } : {}),
      ...(chatId !== undefined ? { chatId } : {}),
      storage,
      ...(limit ? { limit } : {}),
      metadata,
      createdAt: new Date()
    }
  };

  const existingUpdated = await MongoSandboxInstance.findOneAndUpdate(
    {
      provider,
      sandboxId,
      ...archiveStateFilter
    },
    existingUpdate,
    { new: true }
  );
  if (existingUpdated) return existingUpdated;

  const existing = await MongoSandboxInstance.findOne(
    { provider, sandboxId },
    'metadata.archive.state'
  ).lean<Pick<SandboxInstanceSchemaType, 'metadata'> | null>();
  if (existing) return null;

  try {
    return await MongoSandboxInstance.findOneAndUpdate({ provider, sandboxId }, insertUpdate, {
      upsert: true,
      new: true
    });
  } catch {
    return MongoSandboxInstance.findOneAndUpdate(
      {
        provider,
        sandboxId,
        ...archiveStateFilter
      },
      existingUpdate,
      { new: true }
    );
  }
}

/**
 * 将一条资源记录标记为 stopped。
 *
 * resource service 在远端 stop 成功后调用这里同步本地状态。
 */
export async function markSandboxResourceStopped(resource: SandboxResourceRef) {
  return MongoSandboxInstance.updateOne(buildSandboxResourceRecordFilter(resource), {
    $set: { status: SandboxStatusEnum.stopped }
  });
}

/**
 * 查询可被 5 分钟 cron 暂停的运行中 sandbox。
 *
 * 正在归档或恢复的实例由对应流程管理生命周期，stop cron 不能插入中间状态。
 */
export async function findInactiveRunningSandboxResources(inactiveBefore: Date) {
  return MongoSandboxInstance.find({
    status: SandboxStatusEnum.running,
    lastActiveAt: { $lt: inactiveBefore },
    $or: [
      { 'metadata.archive.state': { $exists: false } },
      { 'metadata.archive.state': { $nin: BUSY_ARCHIVE_STATES } }
    ]
  }).lean<SandboxResourceDoc[]>();
}

/**
 * 删除一条 sandbox 实例记录。
 *
 * 优先使用 _id 精确删除；没有 _id 时退回 provider+sandboxId，避免 provider 切换后误删同名资源。
 */
export async function deleteSandboxResourceRecord(resource: SandboxResourceRef) {
  return MongoSandboxInstance.deleteOne(buildSandboxResourceRecordFilter(resource));
}

/**
 * 查询某个 app 下指定 chat 列表关联的资源记录。
 */
export async function findSandboxResourcesByChatIds(params: { appId: string; chatIds: string[] }) {
  const { appId, chatIds } = params;

  return MongoSandboxInstance.find({ appId, chatId: { $in: chatIds } }).lean<
    SandboxResourceDoc[]
  >();
}

/**
 * 查询某个 app 下的所有 sandbox 资源记录。
 */
export async function findSandboxResourcesByAppId(appId: string) {
  return MongoSandboxInstance.find({ appId }).lean<SandboxResourceDoc[]>();
}

/**
 * 按 sandboxId 查询业务归属 appId。
 *
 * 运行态入口允许只传 sandboxId 复用已有实例；权限校验需要先从实例记录反查 appId。
 */
export async function findSandboxAppIdBySandboxId(sandboxId: string) {
  const doc = await MongoSandboxInstance.findOne({ sandboxId }, 'appId').lean<{
    appId?: string;
  } | null>();

  return doc?.appId ? String(doc.appId) : undefined;
}

/**
 * 按显式 sandboxId 查询单条 sandbox 实例。
 *
 * 适用于调用方已经拥有稳定 sandboxId 的场景，避免再把资源定位退回
 * appId/userId/chatId 推导规则。
 */
export async function findSandboxInstanceBySandboxId(params: {
  provider?: SandboxProviderType;
  sandboxId: string;
  appId?: string;
  type?: SandboxTypeEnum;
  status?: SandboxStatusType;
}) {
  const { provider, sandboxId, appId, type, status } = params;

  return MongoSandboxInstance.findOne({
    ...(provider ? { provider } : {}),
    sandboxId,
    ...(appId ? { appId } : {}),
    ...(type ? { type } : {}),
    ...(status ? { status } : {})
  });
}

/**
 * 查询运行态入口关心的 archive 状态。
 *
 * 传入 provider 时按当前 provider 精确查询；未传 provider 时用于 sandboxId 直连场景。
 */
export async function findSandboxInstanceArchiveState(params: {
  provider?: SandboxProviderType;
  sandboxId: string;
}) {
  const { provider, sandboxId } = params;

  return MongoSandboxInstance.findOne(
    {
      sandboxId,
      ...(provider ? { provider } : {})
    },
    'provider sandboxId status lastActiveAt metadata'
  ).lean<SandboxResourceDoc | null>();
}

/**
 * 按 sandboxId 查询任意 provider 下的 archive 状态。
 *
 * 仅用于当前 provider 没有本地记录时的兜底判断：archive 数据是 provider 无关的，
 * 但已有当前 provider 记录时必须以当前资源映射为准，避免覆盖正常运行实例。
 */
export async function findSandboxArchiveStateBySandboxId(sandboxId: string) {
  return MongoSandboxInstance.findOne(
    {
      sandboxId,
      'metadata.archive.state': { $in: ACTIVE_ARCHIVE_STATES }
    },
    'provider sandboxId status lastActiveAt metadata'
  )
    .sort({ lastActiveAt: -1 })
    .lean<SandboxResourceDoc | null>();
}

/**
 * 查询超过指定时间未活跃、尚未冷归档的 stopped sandbox。
 *
 * 一周后的实例应先由 5 分钟 cron 标记为 stopped，再由归档任务统一处理。
 * 归档不直接抢 running 实例，避免和 stop cron 操作同一个远端资源。
 */
export async function findSandboxResourcesToArchive(params: {
  inactiveBefore: Date;
  limit: number;
  providers?: SandboxProviderType[];
}) {
  const { inactiveBefore, limit, providers = ['opensandbox', 'sealosdevbox'] } = params;

  return MongoSandboxInstance.find({
    provider: { $in: providers },
    status: SandboxStatusEnum.stopped,
    lastActiveAt: { $lt: inactiveBefore },
    $or: [
      { 'metadata.archive.state': { $exists: false } },
      { 'metadata.archive.state': { $nin: ACTIVE_ARCHIVE_STATES } }
    ]
  })
    .sort({ lastActiveAt: 1 })
    .limit(limit)
    .lean<SandboxResourceDoc[]>();
}

/**
 * 原子抢占一个待归档实例。
 *
 * 条件里必须包含 lastActiveAt，避免 keepalive/用户请求刚刷新活跃时间后仍被归档。
 */
export async function markSandboxArchiving(resource: SandboxResourceRef, inactiveBefore: Date) {
  return MongoSandboxInstance.findOneAndUpdate(
    {
      ...buildSandboxResourceRecordFilter(resource),
      status: SandboxStatusEnum.stopped,
      lastActiveAt: { $lt: inactiveBefore },
      $or: [
        { 'metadata.archive.state': { $exists: false } },
        { 'metadata.archive.state': { $nin: ACTIVE_ARCHIVE_STATES } }
      ]
    },
    {
      $set: {
        'metadata.archive.state': 'archiving'
      }
    },
    { new: true }
  ).lean<SandboxResourceDoc | null>();
}

/**
 * 标记归档成功。
 *
 * 只在远端资源已经删除成功后调用。此时即使有并发访问清理了 archiving 状态，也必须
 * 写回 archived，避免本地记录误认为仍是热实例而丢失 S3 恢复路径。
 */
export async function markSandboxArchived(resource: SandboxResourceRef) {
  return MongoSandboxInstance.updateOne(buildSandboxResourceRecordFilter(resource), {
    $set: {
      status: SandboxStatusEnum.stopped,
      'metadata.archive.state': 'archived',
      'metadata.archive.archivedAt': new Date()
    }
  });
}

/**
 * 清理 archive 状态。
 *
 * 用于归档被用户活跃打断、恢复成功后回到正常热实例等场景。
 */
export async function clearSandboxArchiveState(resource: SandboxResourceRef) {
  return MongoSandboxInstance.updateOne(buildSandboxResourceRecordFilter(resource), {
    $unset: {
      'metadata.archive': ''
    }
  });
}

/**
 * 原子抢占一个已归档实例进行恢复。
 */
export async function markSandboxRestoring(resource: SandboxResourceRef) {
  return MongoSandboxInstance.findOneAndUpdate(
    {
      ...buildSandboxResourceRecordFilter(resource),
      'metadata.archive.state': 'archived'
    },
    {
      $set: {
        'metadata.archive.state': 'restoring'
      }
    },
    { new: true }
  ).lean<SandboxResourceDoc | null>();
}

/**
 * 恢复失败时退回 archived，保留 S3 归档供用户下次重试。
 */
export async function rollbackSandboxRestoring(resource: SandboxResourceRef) {
  return MongoSandboxInstance.updateOne(buildSandboxResourceRecordFilter(resource), {
    $set: {
      'metadata.archive.state': 'archived'
    }
  });
}

/**
 * 将恢复成功的归档记录切回热实例。
 *
 * provider 可以和归档记录不同：这用于 provider 切换后，把旧 provider 的 archived
 * 记录迁移到当前 provider，避免重新插入时撞上 app/chat 唯一索引，也避免留下旧资源映射。
 */
export async function markSandboxRestored(
  resource: SandboxResourceRef,
  params: {
    provider: SandboxProviderType;
    appId?: string;
    userId?: string;
    chatId?: string;
    storage?: SandboxInstanceSchemaType['storage'];
    limit?: Partial<NonNullable<SandboxInstanceSchemaType['limit']>>;
    metadata?: Record<string, unknown>;
  }
) {
  const metadataSet = Object.fromEntries(
    Object.entries(params.metadata ?? {})
      .filter(([key]) => key !== 'archive' && key !== 'provider')
      .map(([key, value]) => [`metadata.${key}`, value])
  );
  const unsetFields: Record<string, string> = {
    'metadata.archive': '',
    'metadata.provider': ''
  };
  if (params.storage === undefined) {
    unsetFields.storage = '';
  }

  return MongoSandboxInstance.findOneAndUpdate(
    {
      ...buildSandboxResourceRecordFilter(resource),
      'metadata.archive.state': 'restoring'
    },
    {
      $set: {
        provider: params.provider,
        status: SandboxStatusEnum.running,
        lastActiveAt: new Date(),
        ...(params.appId !== undefined ? { appId: params.appId } : {}),
        ...(params.userId !== undefined ? { userId: params.userId } : {}),
        ...(params.chatId !== undefined ? { chatId: params.chatId } : {}),
        ...(params.storage !== undefined ? { storage: params.storage } : {}),
        ...(params.limit ? { limit: params.limit } : {}),
        ...metadataSet
      },
      $unset: unsetFields
    },
    { new: true }
  ).lean<SandboxResourceDoc | null>();
}

/**
 * 按 app/chat/type 查询单条 sandbox 实例。
 *
 * provider 可选是为了兼容“当前 provider 查询”和“只按业务归属查询”两类场景。
 */
export async function findSandboxInstanceByAppChatType(params: {
  provider?: SandboxProviderType;
  appId: string;
  chatId: string;
  type: SandboxTypeEnum;
  status?: SandboxStatusType;
}) {
  const { provider, appId, chatId, type, status } = params;

  return MongoSandboxInstance.findOne({
    ...(provider ? { provider } : {}),
    appId,
    chatId,
    ...(status ? { status } : {}),
    type
  });
}

/**
 * 按 app/chat/type 查询资源清理所需的实例记录。
 */
export async function findSandboxResourcesByAppChatType(params: {
  provider?: SandboxProviderType;
  appId: string;
  chatId: string;
  type: SandboxTypeEnum;
}) {
  const { provider, appId, chatId, type } = params;

  return MongoSandboxInstance.find({
    ...(provider ? { provider } : {}),
    appId,
    chatId,
    type
  }).lean<SandboxResourceDoc[]>();
}

/**
 * 查询同一业务会话下非当前 provider 的历史资源。
 *
 * provider 切换后用这个入口找出旧 provider 留下的实例，再逐条删除。
 */
export async function findSandboxResourcesByAppChatTypeExcludeProvider(params: {
  provider: SandboxProviderType;
  appId: string;
  chatId: string;
  type: SandboxTypeEnum;
}) {
  const { provider, appId, chatId, type } = params;

  return MongoSandboxInstance.find({
    provider: { $ne: provider },
    appId,
    chatId,
    type
  }).lean<SandboxResourceDoc[]>();
}

/**
 * 统计某种 sandbox 类型的运行中实例数量。
 *
 * 用于 edit-debug 等有并发上限的场景；provider 可选，传入时只统计当前 provider。
 */
export async function countRunningSandboxInstancesByType(
  type: SandboxTypeEnum,
  provider?: SandboxProviderType
) {
  return MongoSandboxInstance.countDocuments({
    ...(provider ? { provider } : {}),
    status: SandboxStatusEnum.running,
    type
  });
}

/**
 * 按 Mongo _id 删除实例记录。
 *
 * 仅用于业务确认远端资源已经清理，或需要删除不可恢复的孤立记录时。
 */
export async function deleteSandboxInstanceRecord(instanceId: unknown) {
  return MongoSandboxInstance.deleteOne({ _id: instanceId });
}

/**
 * 更新指定 sandboxId 的业务归属和 metadata。
 *
 * provider 可选；传入 provider 时可以避免同 sandboxId 在不同 provider 下的历史记录互相影响。
 */
export async function updateSandboxInstanceRecordBySandboxId(params: {
  provider?: SandboxProviderType;
  sandboxId: string;
  appId?: string;
  userId?: string;
  chatId?: string;
  type?: SandboxTypeEnum;
  metadata?: Record<string, unknown>;
}): Promise<SandboxInstanceSchemaType | null> {
  const { provider, sandboxId, appId, userId, chatId, type, metadata } = params;

  return MongoSandboxInstance.findOneAndUpdate(
    {
      sandboxId,
      ...(provider ? { provider } : {})
    },
    {
      $set: {
        ...(appId !== undefined ? { appId } : {}),
        ...(userId !== undefined ? { userId } : {}),
        ...(chatId !== undefined ? { chatId } : {}),
        ...(type !== undefined ? { type } : {}),
        ...(metadata !== undefined ? { metadata } : {})
      }
    },
    { new: true }
  );
}

/**
 * 查询团队可访问的 sandbox 实例。
 *
 * 通过 metadata.teamId 做权限边界，支持 sandboxId 或实例 _id 两种输入。
 */
export async function findSandboxInstanceBySandboxIdAndTeam(params: {
  provider?: SandboxProviderType;
  sandboxId: string;
  teamId: string;
}) {
  const { provider, sandboxId, teamId } = params;

  return MongoSandboxInstance.findOne({
    ...buildSandboxInstanceLookup(sandboxId),
    ...(provider ? { provider } : {}),
    'metadata.teamId': teamId
  });
}

/**
 * 查询团队可访问的资源清理记录。
 *
 * 返回 lean 文档，供 deleteSandboxResource 直接按 provider/sandboxId 清理远端资源。
 */
export async function findSandboxResourceBySandboxIdAndTeam(params: {
  provider?: SandboxProviderType;
  sandboxId: string;
  teamId: string;
}) {
  const { provider, sandboxId, teamId } = params;

  return MongoSandboxInstance.findOne({
    ...buildSandboxInstanceLookup(sandboxId),
    ...(provider ? { provider } : {}),
    'metadata.teamId': teamId
  }).lean<SandboxResourceDoc | null>();
}

/**
 * 查询与一组 skill 相关的 sandbox 资源。
 *
 * skill 可能以 appId 作为编辑态归属，也可能记录在 metadata.skillId 中；删除 skill 时两种都要清理。
 */
export async function findSkillRelatedSandboxResources(skillIds: string[]) {
  return MongoSandboxInstance.find({
    $or: [{ appId: { $in: skillIds } }, { 'metadata.skillId': { $in: skillIds } }]
  }).lean<SandboxResourceDoc[]>();
}
