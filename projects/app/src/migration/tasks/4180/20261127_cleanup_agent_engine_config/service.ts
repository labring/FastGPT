import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import type { Types } from '@fastgpt/service/common/mongo';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';
import type { SystemMigrationLogger } from '@/migration/registry';

const FEATURE_DOMAIN = 'feature';
const LEGACY_AGENT_ENGINE_FIELD = 'agentEngine';

type RawFeatureInstanceConfigDoc = {
  _id: Types.ObjectId | string;
  domain?: unknown;
  overrides?: {
    agentEngine?: unknown;
    [key: string]: unknown;
  };
  explicitDefaultPaths?: string[];
  revision?: number;
  updatedAt?: Date;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 使用真实 BSON 文档泛型（`_id: ObjectId | string`）访问原生集合，读写与复查共享同一类型。 */
const getFeatureConfigCollection = () =>
  MongoSystemInstanceConfig.db.collection<RawFeatureInstanceConfigDoc>(
    MongoSystemInstanceConfig.collection.collectionName
  );

/** 兼容标准 domain='feature' 文档及早期以域名字符串作为 _id 的遗留文档。 */
const dirtyFeatureAgentEngineFilter = {
  $and: [
    {
      $or: [{ domain: FEATURE_DOMAIN }, { _id: FEATURE_DOMAIN }]
    },
    {
      $or: [
        { 'overrides.agentEngine': { $exists: true } },
        { explicitDefaultPaths: LEGACY_AGENT_ENGINE_FIELD }
      ]
    }
  ]
};

/** 统计单条 feature 文档中待清理的历史 agentEngine 项数量（overrides 键 + explicitDefaultPaths 标记）。 */
const countDirtyAgentEngineEntries = (doc: RawFeatureInstanceConfigDoc): number => {
  const overrideCount =
    isPlainObject(doc.overrides) && Object.hasOwn(doc.overrides, LEGACY_AGENT_ENGINE_FIELD) ? 1 : 0;
  const markerCount = Array.isArray(doc.explicitDefaultPaths)
    ? doc.explicitDefaultPaths.filter((entry) => entry === LEGACY_AGENT_ENGINE_FIELD).length
    : 0;
  return overrideCount + markerCount;
};

/**
 * 清理 `system_instance_configs` 中 `domain: 'feature'` 残留的 `overrides.agentEngine` 与 `explicitDefaultPaths` 中的 `'agentEngine'`。
 *
 * 幂等与并发安全：
 * - 先在主节点只读查询含残留字段的 `feature` 文档；已干净或文档不存在时零写入直接跳过，绝不无意义递增 `revision`；
 * - 命中脏文档时通过字段级原子操作符（`$unset` + `$pull`）精准剥离 `agentEngine`，不覆盖其他有效 `overrides` 或 `explicitDefaultPaths`，
 *   并同步执行 `$inc: { revision: 1 }` 与 `$set: { updatedAt: new Date() }` 驱动集群配置轮询刷新。
 */
export const cleanupLegacyAgentEngineConfig = async ({
  assertActive,
  signal,
  logger
}: {
  assertActive: () => Promise<void>;
  signal: AbortSignal;
  logger: SystemMigrationLogger;
}): Promise<{ cleanedDocumentCount: number; removedFieldCount: number }> => {
  const collection = getFeatureConfigCollection();
  const dirtyDocs = await collection
    .find(dirtyFeatureAgentEngineFilter, {
      projection: {
        _id: 1,
        domain: 1,
        'overrides.agentEngine': 1,
        explicitDefaultPaths: 1
      },
      readPreference: 'primary'
    })
    .toArray();

  if (dirtyDocs.length === 0) {
    return { cleanedDocumentCount: 0, removedFieldCount: 0 };
  }

  let cleanedDocumentCount = 0;
  let removedFieldCount = 0;

  for (const doc of dirtyDocs) {
    signal.throwIfAborted();
    await assertActive();

    const docRemovedCount = countDirtyAgentEngineEntries(doc);
    if (docRemovedCount === 0) {
      continue;
    }

    const result = await collection.updateOne(
      {
        _id: doc._id,
        $or: [
          { 'overrides.agentEngine': { $exists: true } },
          { explicitDefaultPaths: LEGACY_AGENT_ENGINE_FIELD }
        ]
      },
      {
        $unset: { 'overrides.agentEngine': '' },
        ...(doc.explicitDefaultPaths === undefined || Array.isArray(doc.explicitDefaultPaths)
          ? { $pull: { explicitDefaultPaths: LEGACY_AGENT_ENGINE_FIELD } }
          : {}),
        $inc: { revision: 1 },
        $set: { updatedAt: new Date() }
      }
    );

    if (result.modifiedCount > 0) {
      cleanedDocumentCount += 1;
      removedFieldCount += docRemovedCount;
    }
  }

  logger.info('Cleaned legacy feature.agentEngine instance config entries', {
    cleanedDocumentCount,
    removedFieldCount
  });

  return { cleanedDocumentCount, removedFieldCount };
};

/**
 * 复查 MongoDB 主节点确认 `domain: 'feature'` 不再残留 `overrides.agentEngine` 或 `explicitDefaultPaths: 'agentEngine'`。
 * 返回结构化失败记录（仅含文档 ID 与域标识，绝不携带任何配置值或敏感信息）。
 */
export const validateLegacyAgentEngineConfigCleaned = async (): Promise<
  SystemMigrationFailedRecord[]
> => {
  const remainingDocs = await getFeatureConfigCollection()
    .find(dirtyFeatureAgentEngineFilter, {
      projection: { _id: 1, domain: 1 },
      readPreference: 'primary'
    })
    .toArray();

  return remainingDocs.map((doc) => ({
    stageKey: 'validation',
    data: {
      id: String(doc._id),
      domain: typeof doc.domain === 'string' ? doc.domain : FEATURE_DOMAIN
    },
    reason: {
      message:
        'Residual feature.agentEngine override or explicitDefaultPaths marker still exists after cleanup'
    }
  }));
};
