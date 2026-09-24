import { AppResourcesSchema } from '@fastgpt/global/core/app/type';
import { migrateWorkflowToCurrent } from '@fastgpt/global/core/workflow/migration';
import type { SystemModelDataType } from '@fastgpt/global/core/ai/model/schema';
import pLimit from 'p-limit';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { filterAuthorizedAppResources } from '@fastgpt/service/support/permission/app/resource';
import { getModelHandle } from '@fastgpt/service/core/ai/model';
import { decodeToolSetNodesFromStorage } from '@fastgpt/service/core/app/jsonSchemaStorage';
import { resolveStoredAppResources } from '@fastgpt/service/core/app/resources';

type LegacyResourceRefs = {
  skillIds?: unknown;
};

export type AppResourceMigrationRecord = {
  _id: unknown;
  appId?: unknown;
  nodes?: unknown;
  modules?: unknown;
  edges?: unknown;
  chatConfig?: unknown;
  resources?: unknown;
  resourceRefs?: LegacyResourceRefs;
  type?: unknown;
  tmbId?: unknown;
};

export type AppResourceMigrationFailure = {
  record: AppResourceMigrationRecord;
  message: string;
};

export type AppResourceMigrationBatchResult = {
  failures: AppResourceMigrationFailure[];
  updatedCount: number;
};

const emptyBatchResult = (): AppResourceMigrationBatchResult => ({
  failures: [],
  updatedCount: 0
});

const toObjectId = (value: unknown): Types.ObjectId | undefined => {
  if (value instanceof Types.ObjectId) return value;

  const valueString = String(value ?? '');
  if (!Types.ObjectId.isValid(valueString)) return;
  const objectId = new Types.ObjectId(valueString);
  return String(objectId) === valueString ? objectId : undefined;
};

const getSnapshotQueryValue = (value: unknown) =>
  value === undefined ? { $exists: false } : { $exists: true, $eq: value };

const getWorkflowSnapshot = (record: AppResourceMigrationRecord) => ({
  edges: getSnapshotQueryValue(record.edges),
  chatConfig: getSnapshotQueryValue(record.chatConfig),
  'resourceRefs.skillIds': getSnapshotQueryValue(record.resourceRefs?.skillIds),
  nodes: getSnapshotQueryValue(record.nodes)
});

/** 从历史工作流字段重新计算最新资源快照，忽略已有快照。 */
export const buildAppResourceSnapshot = (
  record: AppResourceMigrationRecord,
  models: readonly SystemModelDataType[] = []
) => {
  const storedNodes = Array.isArray(record.nodes)
    ? record.nodes
    : Array.isArray(record.modules)
      ? record.modules
      : [];
  const normalizedWorkflow = migrateWorkflowToCurrent({
    nodes: decodeToolSetNodesFromStorage(storedNodes),
    edges: Array.isArray(record.edges) ? record.edges : [],
    chatConfig: record.chatConfig
  });
  const resources = resolveStoredAppResources({
    nodes: normalizedWorkflow.nodes,
    chatConfig: normalizedWorkflow.chatConfig,
    resourceRefs: record.resourceRefs,
    models
  });

  return {
    normalizedWorkflow,
    resources
  };
};

/** 仅重新清洗 2026-09-23T11:00:00.000Z（昨天 UTC 11:00）之前创建的历史版本。 */
export const RECOMPUTE_RESOURCE_CUTOFF_TIME = new Date('2026-09-23T11:00:00.000Z');

const getTimeQuery = (cutoffTime: Date = RECOMPUTE_RESOURCE_CUTOFF_TIME) => ({
  $or: [{ time: { $lt: cutoffTime } }, { time: { $exists: false } }]
});

/** 固定集合当前 ObjectId 上界和数量，避免滚动升级期间持续写入使主扫描无法结束。 */
export const initializeAppVersionSnapshot = async (
  cutoffTime: Date = RECOMPUTE_RESOURCE_CUTOFF_TIME
) => {
  const lastRecord = await MongoAppVersion.collection
    .find(
      {
        _id: { $type: 'objectId' },
        ...getTimeQuery(cutoffTime)
      },
      { projection: { _id: 1 } }
    )
    .sort({ _id: -1 })
    .limit(1)
    .next();
  const endId = toObjectId(lastRecord?._id);
  const total = endId
    ? await MongoAppVersion.collection.countDocuments({
        _id: { $type: 'objectId', $lte: endId },
        ...getTimeQuery(cutoffTime)
      })
    : 0;

  return { endId: endId ? String(endId) : null, total };
};

const readObjectIdBatch = <RecordType extends AppResourceMigrationRecord>({
  endId,
  lastId,
  limit,
  projection,
  cutoffTime = RECOMPUTE_RESOURCE_CUTOFF_TIME
}: {
  endId?: string | null;
  lastId: string | null;
  limit: number;
  projection: Record<string, 1>;
  cutoffTime?: Date;
}) => {
  const idRange: { $gt?: Types.ObjectId; $lte?: Types.ObjectId } = {};
  if (lastId) idRange.$gt = new Types.ObjectId(lastId);
  if (endId) idRange.$lte = new Types.ObjectId(endId);

  return MongoAppVersion.collection
    .find(
      {
        _id: { $type: 'objectId', ...idRange },
        ...getTimeQuery(cutoffTime)
      },
      { projection }
    )
    .sort({ _id: 1 })
    .limit(limit)
    .toArray() as Promise<RecordType[]>;
};

/** 按不可变 `_id` 游标读取 Version 当前批次（仅包含 cutoffTime 之前的版本）。 */
export const readAppVersionResourceBatch = (params: {
  endId?: string | null;
  lastId: string | null;
  limit: number;
  cutoffTime?: Date;
}) =>
  readObjectIdBatch<AppResourceMigrationRecord>({
    ...params,
    projection: {
      _id: 1,
      appId: 1,
      nodes: 1,
      edges: 1,
      chatConfig: 1,
      resources: 1,
      'resourceRefs.skillIds': 1
    }
  });

/** 按失败记录中的 ID 重新读取 Version，记录已删除或超出 cutoffTime 时返回空。 */
export const readAppVersionResourceRecord = (
  id: string,
  cutoffTime: Date = RECOMPUTE_RESOURCE_CUTOFF_TIME
) =>
  MongoAppVersion.collection.findOne(
    {
      _id: (toObjectId(id) ?? id) as never,
      ...getTimeQuery(cutoffTime)
    },
    {
      projection: {
        _id: 1,
        appId: 1,
        nodes: 1,
        edges: 1,
        chatConfig: 1,
        resources: 1,
        'resourceRefs.skillIds': 1
      }
    }
  ) as Promise<AppResourceMigrationRecord | null>;

const DB_CONCURRENCY = 20;

const runWithConcurrency = async <Input, Output>({
  items,
  action,
  concurrency = DB_CONCURRENCY
}: {
  items: Input[];
  action: (item: Input) => Promise<Output>;
  concurrency?: number;
}): Promise<Output[]> => {
  if (items.length === 0) return [];
  const limit = pLimit(concurrency);
  return Promise.all(items.map((item) => limit(() => action(item))));
};

/**
 * 重新计算 Version.resources 快照：
 * 1. 批量预加载模型列表；
 * 2. 批量查询所属 App 的应用所有者 tmbId，严格按应用所有者权限过滤资源；
 * 3. 使用 compare-and-set 写入重新计算后的合法资源快照。
 */
export const recomputeAppVersionResourceRecords = async (
  records: AppResourceMigrationRecord[]
): Promise<AppResourceMigrationBatchResult> => {
  const result = emptyBatchResult();
  if (records.length === 0) return result;

  const models = (await getModelHandle()).getAllModels();

  const appIds = records.map((record) => record.appId).filter(Boolean);
  const apps =
    appIds.length === 0
      ? []
      : await MongoApp.collection
          .find({ _id: { $in: appIds as never } }, { projection: { _id: 1, tmbId: 1 } })
          .toArray();
  const appOwnerTmbIdByAppId = new Map(
    apps.map((app) => [String(app._id), app.tmbId ? String(app.tmbId) : undefined])
  );

  const processResults = await runWithConcurrency({
    items: records,
    action: async (
      record
    ): Promise<{ updated: boolean; failure?: AppResourceMigrationFailure }> => {
      try {
        const appOwnerTmbId = record.appId
          ? appOwnerTmbIdByAppId.get(String(record.appId))
          : undefined;
        if (!appOwnerTmbId) {
          return {
            updated: false,
            failure: {
              record,
              message: `Cannot find app owner tmbId for version ${String(record._id)}`
            }
          };
        }

        const snapshot = buildAppResourceSnapshot(record, models);
        const authorizedResources = await filterAuthorizedAppResources({
          resources: snapshot.resources,
          tmbId: appOwnerTmbId
        });
        const updateResult = await MongoAppVersion.collection.updateOne(
          {
            _id: record._id as never,
            resources: getSnapshotQueryValue(record.resources),
            ...getWorkflowSnapshot(record)
          },
          { $set: { resources: authorizedResources } }
        );
        if (updateResult.matchedCount === 1) {
          return { updated: true };
        }

        const current = await MongoAppVersion.collection.findOne(
          { _id: record._id as never },
          { projection: { resources: 1 } }
        );
        if (!current) return { updated: false };
        const currentParsed = AppResourcesSchema.safeParse(current.resources);
        if (currentParsed.success) return { updated: false };
        if (current.resources !== undefined) {
          return {
            updated: false,
            failure: {
              record,
              message: currentParsed.error.message
            }
          };
        }
        return {
          updated: false,
          failure: {
            record,
            message: 'App Version changed concurrently before its resources could be recomputed'
          }
        };
      } catch (error) {
        return {
          updated: false,
          failure: {
            record,
            message: error instanceof Error ? error.message : String(error)
          }
        };
      }
    }
  });

  for (const item of processResults) {
    if (item.updated) result.updatedCount += 1;
    if (item.failure) result.failures.push(item.failure);
  }

  return result;
};

/** 扫描 Version 快照的真实完成条件，并返回需要管理员处理的记录。 */
export const validateAppVersionResourceRecords = (records: AppResourceMigrationRecord[]) =>
  records.flatMap<AppResourceMigrationFailure>((record) => {
    const parsed = AppResourcesSchema.safeParse(record.resources);
    return parsed.success ? [] : [{ record, message: parsed.error.message }];
  });
