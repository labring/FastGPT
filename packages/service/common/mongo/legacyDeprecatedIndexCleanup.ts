import {
  dropManagedMongoIndexIfExists,
  type DropMongoIndexResult,
  type ExpectedMongoIndexOptions,
  type MongoIndexRequirement
} from '@fastgpt/dal/db/mongo/indexSync';
import type { DbDatasource } from '@fastgpt/dal/db/types';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';
import { agentSkillsCollectionName } from '@fastgpt/global/core/ai/skill/constants';
import { TeamMemberCollectionName } from '@fastgpt/global/support/user/team/constant';
import type { Mongoose } from 'mongoose';
import { connectionLogMongo, connectionMongo } from './index';

export type LegacyDeprecatedMongoIndexEntry = {
  collectionName: string;
  datasource: DbDatasource;
  indexName: string;
  key: Record<string, unknown>;
  /** 显式声明完整历史选项签名（普通非唯一非条件索引固定传 `{}`），防止误删客户同名定制索引。 */
  options: ExpectedMongoIndexOptions;
  /**
   * 显式声明必须已构建就绪的替代索引列表。
   * 自动迁移在目标集合存在本废弃索引时，必须先确认这些替代索引全部出现在现网 `listIndexes()` 后才允许删除。
   */
  requiredIndexes?: readonly MongoIndexRequirement[];
  reason: string;
};

/**
 * 历史上曾登记在 11 个旧版 Schema 中的 18 条废弃 Mongo 索引显式一次性清理清单。
 *
 * 原则收敛后，所有 `schema.ts` 严禁再保留 `deprecated: true` 永久墓碑；既有 18 条历史废弃索引
 * 统一收口到此一次性清理目录中，仅通过显式运维/一次性迁移调用按 `name + key + 完整 options`
 * 精确匹配删除，并在删除前校验声明的 `requiredIndexes` 已就绪，100% 保护客户 DBA 自建索引与线上查询性能。
 */
export const LEGACY_DEPRECATED_MONGO_INDEXES: readonly LegacyDeprecatedMongoIndexEntry[] = [
  {
    collectionName: TeamMemberCollectionName,
    datasource: 'main',
    indexName: 'userId_1',
    key: { userId: 1 },
    options: {},
    requiredIndexes: [{ key: { userId: 1, teamId: 1 }, options: { unique: true } }],
    reason: 'Replaced by compound team member lookup indexes'
  },
  {
    collectionName: 'systemConfigs',
    datasource: 'main',
    indexName: 'runtime_scope_type_unique',
    key: { type: 1 },
    options: {
      unique: true,
      partialFilterExpression: {
        type: {
          $in: [
            SystemConfigsTypeEnum.proEnv,
            SystemConfigsTypeEnum.subPlans,
            SystemConfigsTypeEnum.langfuse
          ]
        }
      }
    },
    requiredIndexes: [{ key: { type: 1 }, options: {} }],
    reason: 'Retired runtime scope partial unique index after config scope migration'
  },
  {
    collectionName: 'dataset_datas',
    datasource: 'main',
    indexName: 'rebuilding_1_teamId_1_datasetId_1',
    key: { rebuilding: 1, teamId: 1, datasetId: 1 },
    options: {},
    requiredIndexes: [{ key: { indexStatus: 1, teamId: 1, datasetId: 1 }, options: {} }],
    reason: 'Replaced by indexStatus_1_teamId_1_datasetId_1'
  },
  {
    collectionName: 'chats',
    datasource: 'main',
    indexName: 'chatGenerateStatus_1_updateTime_1',
    key: { chatGenerateStatus: 1, updateTime: 1 },
    options: {
      partialFilterExpression: {
        chatGenerateStatus: 0
      }
    },
    reason: 'Replaced by Redis generation lease'
  },
  {
    collectionName: 'chats',
    datasource: 'main',
    indexName: 'appId_1_updateTime_-1',
    key: { appId: 1, updateTime: -1 },
    options: {},
    requiredIndexes: [{ key: { appId: 1, updateTime: -1, _id: -1 }, options: {} }],
    reason: 'Strictly prefix-covered by { appId: 1, updateTime: -1, _id: -1 } cursor log index'
  },
  {
    collectionName: 'agent_sandbox_instances_v2',
    datasource: 'main',
    indexName: 'sourceType_1_status_1_provider_1',
    key: { sourceType: 1, status: 1, provider: 1 },
    options: {},
    requiredIndexes: [{ key: { teamId: 1, status: 1 }, options: {} }],
    reason: 'Replaced by teamId_1_status_1 quota index'
  },
  {
    collectionName: 'agent_sandbox_instances_v2',
    datasource: 'main',
    indexName: 'status_1_metadata.operation.heartbeatAt_1',
    key: { status: 1, 'metadata.operation.heartbeatAt': 1 },
    options: {},
    requiredIndexes: [{ key: { status: 1, 'operation.heartbeatAt': 1 }, options: {} }],
    reason: 'Replaced by status_1_operation.heartbeatAt_1'
  },
  {
    collectionName: 'app_versions',
    datasource: 'main',
    indexName: 'appId_1_resources.type_1_resources.id_1',
    key: { appId: 1, 'resources.type': 1, 'resources.id': 1 },
    options: {},
    reason: 'Retired resource lookup index on app_versions'
  },
  {
    collectionName: 'app_chat_logs',
    datasource: 'log',
    indexName: 'teamId_1_appId_1_source_1_updateTime_-1',
    key: { teamId: 1, appId: 1, source: 1, updateTime: -1 },
    options: {},
    requiredIndexes: [{ key: { teamId: 1, appId: 1, updateTime: -1, userId: 1 }, options: {} }],
    reason: 'Retired app_chat_logs source chart index'
  },
  {
    collectionName: 'app_chat_logs',
    datasource: 'log',
    indexName: 'teamId_1_appId_1_userId_1',
    key: { teamId: 1, appId: 1, userId: 1 },
    options: {},
    requiredIndexes: [{ key: { teamId: 1, appId: 1, userId: 1, createTime: 1 }, options: {} }],
    reason: 'Retired app_chat_logs userId index'
  },
  {
    collectionName: 'app_chat_logs',
    datasource: 'log',
    indexName: 'createTime_-1_appId_1_chatId_1',
    key: { createTime: -1, appId: 1, chatId: 1 },
    options: {},
    requiredIndexes: [{ key: { teamId: 1, appId: 1, chatId: 1 }, options: {} }],
    reason: 'Retired app_chat_logs createTime index'
  },
  {
    collectionName: 'model_status_probe_records',
    datasource: 'main',
    indexName: 'modelId_1_testedAt_-1',
    key: { modelId: 1, testedAt: -1 },
    options: {},
    requiredIndexes: [{ key: { modelId: 1, requestEndedAt: -1 }, options: {} }],
    reason: 'Replaced by modelId_1_requestEndedAt_-1'
  },
  {
    collectionName: 'model_status_probe_records',
    datasource: 'main',
    indexName: 'testedAt_1',
    key: { testedAt: 1 },
    options: { expireAfterSeconds: 30 * 24 * 60 * 60 },
    requiredIndexes: [
      { key: { requestEndedAt: 1 }, options: { expireAfterSeconds: 30 * 24 * 60 * 60 } }
    ],
    reason: 'Replaced by requestEndedAt_1 TTL index'
  },
  {
    collectionName: agentSkillsCollectionName,
    datasource: 'main',
    indexName: 'source_1_teamId_1_deleteTime_1_createTime_-1',
    key: { source: 1, teamId: 1, deleteTime: 1, createTime: -1 },
    options: {},
    requiredIndexes: [{ key: { source: 1, teamId: 1, createTime: 1 }, options: {} }],
    reason: 'Retired agent_skills listing index'
  },
  {
    collectionName: 'dataset_collections',
    datasource: 'main',
    indexName: 'teamId_1_datasetId_1_parentId_1_inheritPermission_1',
    key: { teamId: 1, datasetId: 1, parentId: 1, inheritPermission: 1 },
    options: {},
    requiredIndexes: [
      {
        key: {
          teamId: 1,
          datasetId: 1,
          type: 1,
          parentId: 1,
          inheritPermission: 1,
          _id: 1
        },
        options: {}
      }
    ],
    reason: 'Consolidated into type/directory composite index'
  },
  {
    collectionName: 'dataset_collections',
    datasource: 'main',
    indexName: 'teamId_1_datasetId_1_tags_1',
    key: { teamId: 1, datasetId: 1, tags: 1 },
    options: {},
    requiredIndexes: [
      { key: { teamId: 1, datasetId: 1, 'tags.tagId': 1, 'tags.value': 1 }, options: {} }
    ],
    reason: 'Replaced by structured tags.tagId / tags.value indexes'
  },
  {
    collectionName: 'dataset_collections',
    datasource: 'main',
    indexName: 'teamId_1_metadata.relatedImgId_1',
    key: { teamId: 1, 'metadata.relatedImgId': 1 },
    options: {},
    reason: 'Retired after legacy image cleanup task removal'
  },
  {
    collectionName: 'datasets',
    datasource: 'main',
    indexName: 'teamId_1',
    key: { teamId: 1 },
    options: {},
    requiredIndexes: [{ key: { teamId: 1, createTime: 1 }, options: {} }],
    reason: 'Covered by leading teamId composite indexes on datasets'
  }
];

/**
 * 显式执行一次性历史废弃 Mongo 索引清理（不在启动同步热路径中自动执行）。
 *
 * 每条删除均严格校验 `indexName + expectedKey + expectedOptions` 完全匹配，
 * 若遇客户同名自定义索引直接返回 `skipped_mismatch` 绝不误删。
 */
export const runLegacyDeprecatedMongoIndexCleanup = async ({
  mainClient = connectionMongo,
  logClient = connectionLogMongo,
  entries = LEGACY_DEPRECATED_MONGO_INDEXES,
  collectionOverrides,
  apply = true
}: {
  mainClient?: Mongoose;
  logClient?: Mongoose;
  entries?: readonly LegacyDeprecatedMongoIndexEntry[];
  /** 可选测试/运维映射：按逻辑集合名重定向到目标物理集合名。 */
  collectionOverrides?: Readonly<Record<string, string>>;
  apply?: boolean;
} = {}): Promise<DropMongoIndexResult[]> => {
  const results: DropMongoIndexResult[] = [];

  for (const entry of entries) {
    const targetClient = entry.datasource === 'log' ? logClient : mainClient;
    const physicalCollection = collectionOverrides?.[entry.collectionName] ?? entry.collectionName;

    const result = await dropManagedMongoIndexIfExists({
      client: targetClient,
      collectionName: physicalCollection,
      indexName: entry.indexName,
      expectedKey: entry.key,
      expectedOptions: entry.options,
      apply
    });
    results.push(result);
  }

  return results;
};
