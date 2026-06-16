import type { SandboxStatusType } from '@fastgpt/global/core/ai/sandbox/constants';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import type { SandboxTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { MongoSandboxInstance } from './schema';
import type { SandboxInstanceSchemaType, SandboxProviderType } from '../type';

const SANDBOX_ARCHIVE_CURSOR_BATCH_SIZE = 100;

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
  status?: SandboxStatusType;
  lastActiveAt?: Date;
  _id?: unknown;
};

export const buildSandboxInstanceLookup = (sandboxId: string) => ({ sandboxId });

const buildSandboxResourceRecordFilter = (resource: SandboxResourceRef) => {
  if (resource._id !== undefined) {
    return { _id: resource._id };
  }
  return {
    provider: resource.provider,
    sandboxId: resource.sandboxId
  };
};

const buildSandboxResourcesToArchiveQuery = (params: {
  inactiveBefore: Date;
  providers?: SandboxProviderType[];
}) => {
  const { inactiveBefore, providers = ['opensandbox', 'sealosdevbox'] } = params;

  return MongoSandboxInstance.find({
    provider: { $in: providers },
    status: SandboxStatusEnum.stopped,
    lastActiveAt: { $lt: inactiveBefore },
    'metadata.archive.state': { $exists: false }
  }).sort({ lastActiveAt: -1 });
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
  const archiveStateFilter = { 'metadata.archive.state': { $exists: false } };
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
 * 当调用方传入 lastActiveAt/status 时，使用 CAS 避免用户请求刚刷新活跃时间后又被旧 cron 结果覆盖。
 */
export async function markSandboxResourceStopped(resource: SandboxResourceRef) {
  return MongoSandboxInstance.updateOne(
    {
      ...buildSandboxResourceRecordFilter(resource),
      ...(resource.status ? { status: resource.status } : {}),
      ...(resource.lastActiveAt ? { lastActiveAt: resource.lastActiveAt } : {}),
      'metadata.archive.state': { $exists: false }
    },
    {
      $set: { status: SandboxStatusEnum.stopped }
    }
  );
}

/**
 * 查询可被 5 分钟 cron 暂停的运行中 sandbox。
 *
 * 正在归档或已归档的实例由归档流程管理生命周期，stop cron 不能插入中间状态。
 */
export async function findInactiveRunningSandboxResources(inactiveBefore: Date) {
  return MongoSandboxInstance.find({
    status: SandboxStatusEnum.running,
    lastActiveAt: { $lt: inactiveBefore },
    'metadata.archive.state': { $exists: false }
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
 * 流式读取待归档 sandbox，避免迁移脚本或 cron 一次性把历史全量记录拉进 Node.js 内存。
 *
 * 一周后的实例应先由 5 分钟 cron 标记为 stopped，再由归档任务统一处理。
 * 归档不直接抢 running 实例，避免和 stop cron 操作同一个远端资源。
 */
export function createSandboxResourcesToArchiveCursor(params: {
  inactiveBefore: Date;
  providers?: SandboxProviderType[];
}) {
  return buildSandboxResourcesToArchiveQuery(params)
    .lean<SandboxResourceDoc>()
    .cursor({ batchSize: SANDBOX_ARCHIVE_CURSOR_BATCH_SIZE });
}

/**
 * 原子抢占一个待归档实例。
 *
 * 条件里必须包含 lastActiveAt，避免 keepalive/用户请求刚刷新活跃时间后仍被归档。
 */
export async function markSandboxArchiving(resource: SandboxResourceDoc, inactiveBefore: Date) {
  if (resource.lastActiveAt >= inactiveBefore) {
    return null;
  }

  return MongoSandboxInstance.findOneAndUpdate(
    {
      ...buildSandboxResourceRecordFilter(resource),
      status: SandboxStatusEnum.stopped,
      lastActiveAt: resource.lastActiveAt,
      'metadata.archive.state': { $exists: false }
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
 * 只有仍处于同一轮 archiving 的 stopped 记录才能切到 archived。
 */
export async function markSandboxArchived(resource: SandboxResourceDoc) {
  return MongoSandboxInstance.updateOne(
    {
      ...buildSandboxResourceRecordFilter(resource),
      status: SandboxStatusEnum.stopped,
      lastActiveAt: resource.lastActiveAt,
      'metadata.archive.state': 'archiving'
    },
    {
      $set: {
        status: SandboxStatusEnum.stopped,
        'metadata.archive.state': 'archived',
        'metadata.archive.archivedAt': new Date()
      }
    }
  );
}

/**
 * 删除远端资源前做二次确认。
 *
 * 归档期间运行态会阻塞 archiving 状态；这里再用原始 lastActiveAt 做一次 CAS 式确认，
 * 避免处理已经被外部修改过的记录。
 */
export async function isSandboxStillArchiving(resource: SandboxResourceDoc, inactiveBefore: Date) {
  if (resource.lastActiveAt >= inactiveBefore) {
    return false;
  }

  const doc = await MongoSandboxInstance.exists({
    ...buildSandboxResourceRecordFilter(resource),
    status: SandboxStatusEnum.stopped,
    lastActiveAt: resource.lastActiveAt,
    'metadata.archive.state': 'archiving'
  });
  return !!doc;
}

/**
 * 清理 archive 状态。
 *
 * 只用于归档在删除远端资源前被用户活跃打断或失败的场景；恢复成功由 markSandboxRestored 处理。
 */
export async function clearSandboxArchiveState(resource: SandboxResourceRef) {
  return MongoSandboxInstance.updateOne(
    {
      ...buildSandboxResourceRecordFilter(resource),
      'metadata.archive.state': 'archiving'
    },
    {
      $unset: {
        'metadata.archive': ''
      }
    }
  );
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
  return MongoSandboxInstance.updateOne(
    {
      ...buildSandboxResourceRecordFilter(resource),
      'metadata.archive.state': 'restoring'
    },
    {
      $set: {
        'metadata.archive.state': 'archived'
      }
    }
  );
}

/**
 * 将恢复成功的归档记录切回热实例。
 */
export async function markSandboxRestored(
  resource: SandboxResourceRef,
  params: {
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
 * 将旧 provider 的归档记录迁移到当前 provider/sandboxId。
 *
 * edit-debug sandboxId 由 skillId + edit-debug 稳定生成，不随 provider 变化；provider 切换后，
 * archive restore 入口只按当前 provider + sandboxId 查询归档状态。这里仅迁移 Mongo 索引记录，
 * 不触碰 S3 归档对象；如果新 provider 已有上次失败留下的
 * 占位记录，则把归档 metadata 转移过去并删除旧记录，释放 appId/chatId 唯一键。
 */
export async function migrateArchivedSandboxInstanceRecord(params: {
  source: SandboxResourceRef;
  provider: SandboxProviderType;
  appId: string;
  userId: string;
  chatId: string;
  type: SandboxTypeEnum;
}) {
  const { source, provider, appId, userId, chatId, type } = params;
  const sourceFilter = {
    ...buildSandboxResourceRecordFilter(source),
    'metadata.archive.state': 'archived'
  };
  const baseSet = {
    provider,
    sandboxId: source.sandboxId,
    appId,
    userId,
    chatId,
    type,
    status: SandboxStatusEnum.stopped,
    lastActiveAt: new Date()
  };
  const isMongoDuplicateKeyError = (error: unknown) =>
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000;

  try {
    return await MongoSandboxInstance.findOneAndUpdate(
      sourceFilter,
      {
        $set: baseSet
      },
      { new: true }
    ).lean<SandboxResourceDoc | null>();
  } catch (error) {
    if (!isMongoDuplicateKeyError(error)) throw error;

    const target = await MongoSandboxInstance.findOne({
      provider,
      sandboxId: source.sandboxId
    }).lean<Pick<SandboxInstanceSchemaType, '_id'> | null>();
    if (!target) throw error;

    type ArchivedSandboxMigrationDoc = Pick<
      SandboxInstanceSchemaType,
      'appId' | 'userId' | 'chatId' | 'type' | 'metadata' | 'storage' | 'limit'
    > & { _id: unknown };

    const sourceDoc = await MongoSandboxInstance.findOneAndUpdate(
      sourceFilter,
      {
        $unset: {
          appId: '',
          userId: '',
          chatId: '',
          type: ''
        }
      },
      { new: false }
    ).lean<ArchivedSandboxMigrationDoc | null>();
    if (!sourceDoc?.metadata?.archive) return null;

    const rollbackSourceBusinessKeys = async () => {
      await MongoSandboxInstance.updateOne(
        {
          _id: sourceDoc._id,
          'metadata.archive.state': 'archived'
        },
        {
          $set: {
            ...(sourceDoc.appId !== undefined ? { appId: sourceDoc.appId } : {}),
            ...(sourceDoc.userId !== undefined ? { userId: sourceDoc.userId } : {}),
            ...(sourceDoc.chatId !== undefined ? { chatId: sourceDoc.chatId } : {}),
            ...(sourceDoc.type !== undefined ? { type: sourceDoc.type } : {})
          }
        }
      );
    };

    let migratedDoc: SandboxResourceDoc | null = null;
    try {
      migratedDoc = await MongoSandboxInstance.findOneAndUpdate(
        {
          _id: target._id,
          'metadata.archive.state': { $exists: false }
        },
        {
          $set: {
            ...baseSet,
            ...(sourceDoc.storage !== undefined ? { storage: sourceDoc.storage } : {}),
            ...(sourceDoc.limit !== undefined ? { limit: sourceDoc.limit } : {}),
            metadata: sourceDoc.metadata
          }
        },
        { new: true }
      ).lean<SandboxResourceDoc | null>();
    } catch (targetUpdateError) {
      await rollbackSourceBusinessKeys();
      throw targetUpdateError;
    }

    if (!migratedDoc) {
      const existingArchivedTarget = await MongoSandboxInstance.findOne({
        _id: target._id,
        'metadata.archive.state': 'archived'
      }).lean<SandboxResourceDoc | null>();
      if (!existingArchivedTarget) {
        await rollbackSourceBusinessKeys();
        return null;
      }
      migratedDoc = existingArchivedTarget;
    }

    await MongoSandboxInstance.deleteOne({ _id: sourceDoc._id });
    return migratedDoc;
  }
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
 * 通过 metadata.teamId 做权限边界，只接受业务 sandboxId。
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
