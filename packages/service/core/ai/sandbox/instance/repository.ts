import { isValidObjectId } from 'mongoose';
import type { SandboxStatusType } from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import type { SandboxTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { MongoSandboxInstance } from './schema';
import type { SandboxInstanceSchemaType, SandboxProviderType } from '../type';

/**
 * 可直接用于 stop/delete 的实例记录最小字段。
 *
 * 清理流程只依赖 provider 和 sandboxId，避免把完整 Mongo 文档泄漏到 resource service。
 */
export type SandboxResourceDoc = Pick<
  SandboxInstanceSchemaType,
  'provider' | 'sandboxId' | 'type'
> & {
  _id: unknown;
};

export type SandboxResourceRef = {
  provider: SandboxProviderType;
  sandboxId: string;
  _id?: unknown;
};

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

  return MongoSandboxInstance.findOneAndUpdate(
    { provider, sandboxId },
    {
      $set: {
        status: SandboxStatusEnum.running,
        lastActiveAt: new Date()
      },
      $setOnInsert: {
        ...(appId !== undefined ? { appId } : {}),
        ...(userId !== undefined ? { userId } : {}),
        ...(chatId !== undefined ? { chatId } : {}),
        storage,
        ...(limit ? { limit } : {}),
        metadata,
        createdAt: new Date()
      }
    },
    { upsert: true }
  );
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
 * 查询超过指定时间未活跃的运行中 sandbox 资源。
 *
 * cron 使用这个入口获得最小清理字段，后续由 resource service 按 provider 执行 stop。
 */
export async function findInactiveRunningSandboxResources(inactiveBefore: Date) {
  return MongoSandboxInstance.find({
    status: SandboxStatusEnum.running,
    lastActiveAt: { $lt: inactiveBefore }
  }).lean<SandboxResourceDoc[]>();
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
