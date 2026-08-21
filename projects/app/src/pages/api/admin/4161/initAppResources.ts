import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { BoolSchema, IntSchema } from '@fastgpt/global/common/zod';
import { AppResourcesSchema, type AppResourcesType } from '@fastgpt/global/core/app/type';
import type { AppSchemaType } from '@fastgpt/global/core/app/type';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { normalizeWorkflowConfig } from '@fastgpt/global/core/workflow/utils';
import { extractAppResources, mergeAppResources } from '@fastgpt/service/core/app/resources';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import z from 'zod';

/*
 * API: 初始化 App 资源快照
 * Route: POST /api/admin/4161/initAppResources
 * Method: POST
 * Description: 回填 App 与 App Version 的 resources，并清理历史 resourceRefs。
 * Tags: ['Admin', 'DataClean', 'App', 'Write']
 */

type LegacyResourceRefs = {
  skillIds?: unknown;
};

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_WRITE_BATCH_SIZE = 50;

type RawWorkflowRecord = {
  _id?: Types.ObjectId;
  appId?: unknown;
  isPublish?: unknown;
  nodes?: unknown;
  modules?: unknown;
  edges?: unknown;
  chatConfig?: unknown;
  resources?: unknown;
  resourceRefs?: LegacyResourceRefs;
};

const InitAppResourcesBodySchema = z.object({
  dryRun: BoolSchema.optional().default(true),
  batchSize: IntSchema.min(1).max(5000).optional().default(DEFAULT_BATCH_SIZE),
  writeBatchSize: IntSchema.min(1).max(1000).optional().default(DEFAULT_WRITE_BATCH_SIZE)
});
export type InitAppResourcesBodyType = z.infer<typeof InitAppResourcesBodySchema>;

const AppResourcesMigrationStatsSchema = z.object({
  appsScanned: z.number().int().nonnegative(),
  versionsScanned: z.number().int().nonnegative(),
  appsUpdated: z.number().int().nonnegative(),
  versionsUpdated: z.number().int().nonnegative(),
  legacySkillRefs: z.number().int().nonnegative(),
  legacySkillMismatches: z.number().int().nonnegative()
});
type MigrationStats = z.infer<typeof AppResourcesMigrationStatsSchema>;

const InitAppResourcesResponseSchema = z.object({
  dryRun: z.boolean(),
  batchSize: z.number().int().positive(),
  writeBatchSize: z.number().int().positive(),
  stats: AppResourcesMigrationStatsSchema
});
export type InitAppResourcesResponseType = z.infer<typeof InitAppResourcesResponseSchema>;

type MigratedRecord = Pick<RawWorkflowRecord, '_id' | 'resources' | 'resourceRefs'>;

type ResourceMigrationRecordHandler = (params: {
  record: RawWorkflowRecord;
  resources: AppResourcesType;
}) => void;

const createStats = (): MigrationStats => ({
  appsScanned: 0,
  versionsScanned: 0,
  appsUpdated: 0,
  versionsUpdated: 0,
  legacySkillRefs: 0,
  legacySkillMismatches: 0
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getLegacySkillIds = (resourceRefs: unknown) => {
  if (!isRecord(resourceRefs) || !Array.isArray(resourceRefs.skillIds)) return [];
  return resourceRefs.skillIds.filter(
    (id): id is string => typeof id === 'string' && id.length > 0
  );
};

const getExistingResources = (resources: unknown): AppResourcesType | undefined => {
  if (!Array.isArray(resources)) return;
  const result = AppResourcesSchema.safeParse(resources);
  return result.success ? result.data : undefined;
};

const countMissingLegacySkills = ({
  legacySkillIds,
  resources
}: {
  legacySkillIds: string[];
  resources: AppResourcesType;
}) => {
  const skillIds = new Set(
    resources.filter((resource) => resource.type === 'skill').map((resource) => resource.id)
  );
  return legacySkillIds.filter((id) => !skillIds.has(id)).length;
};

const mergeLegacySkillResources = (
  resources: AppResourcesType,
  legacySkillIds: string[]
): AppResourcesType =>
  mergeAppResources([
    ...resources,
    ...legacySkillIds.map((id) => ({ type: 'skill' as const, id }))
  ]);

const buildResources = ({
  nodes,
  modules,
  edges,
  chatConfig,
  resources,
  resourceRefs,
  stats
}: RawWorkflowRecord & { stats: MigrationStats }): AppResourcesType => {
  const workflowNodes = Array.isArray(nodes) ? nodes : Array.isArray(modules) ? modules : undefined;
  const legacySkillIds = getLegacySkillIds(resourceRefs);
  stats.legacySkillRefs += legacySkillIds.length;

  const extracted = workflowNodes
    ? (() => {
        const normalizedWorkflow = normalizeWorkflowConfig({
          nodes: workflowNodes as StoreNodeItemType[],
          edges: (Array.isArray(edges) ? edges : []) as AppSchemaType['edges'],
          chatConfig: chatConfig as AppSchemaType['chatConfig']
        });
        return extractAppResources({
          nodes: normalizedWorkflow.nodes,
          chatConfig: normalizedWorkflow.chatConfig
        });
      })()
    : (getExistingResources(resources) ?? []);
  stats.legacySkillMismatches += countMissingLegacySkills({
    legacySkillIds,
    resources: extracted
  });
  return AppResourcesSchema.parse(mergeLegacySkillResources(extracted, legacySkillIds));
};

type MongoCollection = typeof MongoApp.collection;
type MongoBulkWriteOperation = Parameters<MongoCollection['bulkWrite']>[0][number];

/**
 * 按固定读取和写入批次迁移单个集合，先计算完整批次资源再批量写入；
 * 资源校验通过前保留旧 resourceRefs，避免迁移中断后丢失重试依据。
 */
const migrateCollection = async ({
  collection,
  stats,
  dryRun,
  isVersion,
  batchSize,
  writeBatchSize,
  buildResources,
  onResourcesBuilt
}: {
  collection: MongoCollection;
  stats: MigrationStats;
  dryRun: boolean;
  isVersion: boolean;
  batchSize: number;
  writeBatchSize: number;
  buildResources: (record: RawWorkflowRecord) => AppResourcesType;
  onResourcesBuilt?: ResourceMigrationRecordHandler;
}) => {
  const flushWrites = async (operations: MongoBulkWriteOperation[]) => {
    for (let start = 0; start < operations.length; start += writeBatchSize) {
      const batchOperations = operations.slice(start, start + writeBatchSize);
      const result = await collection.bulkWrite(batchOperations, { ordered: false });
      const matchedCount = result.matchedCount ?? 0;
      if (matchedCount !== batchOperations.length) {
        throw new Error(
          `Migration update missed ${isVersion ? 'version' : 'app'} documents: ` +
            `expected=${batchOperations.length}, matched=${matchedCount}`
        );
      }
      if (isVersion) stats.versionsUpdated += matchedCount;
      else stats.appsUpdated += matchedCount;
    }
  };

  const migrateBatch = async (records: RawWorkflowRecord[]) => {
    const operations: MongoBulkWriteOperation[] = [];

    records.forEach((record) => {
      if (isVersion) stats.versionsScanned += 1;
      else stats.appsScanned += 1;

      const resources = buildResources(record);
      onResourcesBuilt?.({ record, resources });
      if (dryRun) return;

      operations.push({
        updateOne: {
          filter: { _id: record._id },
          update: {
            $set: { resources }
          }
        }
      });
    });

    if (!dryRun) await flushWrites(operations);
  };

  // Version 必须保持与 getAppLatestVersion 一致的时间倒序；App 使用稳定的 _id 顺序。
  const cursor = collection
    .find({})
    .sort(isVersion ? { time: -1 } : { _id: 1 })
    .batchSize(batchSize);
  let records: RawWorkflowRecord[] = [];

  for await (const rawRecord of cursor) {
    records.push(rawRecord as RawWorkflowRecord);
    if (records.length < batchSize) continue;

    await migrateBatch(records);
    records = [];
  }

  if (records.length > 0) await migrateBatch(records);
};

/** 资源迁移和全量校验完成后，按批次清理历史 resourceRefs 字段。 */
const cleanupLegacyResourceRefs = async ({
  collection,
  batchSize,
  writeBatchSize,
  isVersion
}: {
  collection: MongoCollection;
  batchSize: number;
  writeBatchSize: number;
  isVersion: boolean;
}) => {
  const flushWrites = async (operations: MongoBulkWriteOperation[]) => {
    for (let start = 0; start < operations.length; start += writeBatchSize) {
      const batchOperations = operations.slice(start, start + writeBatchSize);
      const result = await collection.bulkWrite(batchOperations, { ordered: false });
      const matchedCount = result.matchedCount ?? 0;
      if (matchedCount !== batchOperations.length) {
        throw new Error(
          `Legacy resourceRefs cleanup missed ${isVersion ? 'version' : 'app'} documents: ` +
            `expected=${batchOperations.length}, matched=${matchedCount}`
        );
      }
    }
  };

  const cursor = collection
    .find({ resourceRefs: { $exists: true } }, { projection: { _id: 1 } })
    .sort({ _id: 1 })
    .batchSize(batchSize);
  let operations: MongoBulkWriteOperation[] = [];

  for await (const rawRecord of cursor) {
    operations.push({
      updateOne: {
        filter: { _id: rawRecord._id },
        update: {
          $unset: { resourceRefs: 1 }
        }
      }
    });
    if (operations.length < writeBatchSize) continue;

    await flushWrites(operations);
    operations = [];
  }

  if (operations.length > 0) await flushWrites(operations);
};

const verifyResources = async ({
  collection,
  collectionName,
  batchSize
}: {
  collection: MongoCollection;
  collectionName: string;
  batchSize: number;
}) => {
  const cursor = collection.find({}, { projection: { _id: 1, resources: 1 } }).batchSize(batchSize);
  for await (const rawRecord of cursor) {
    const record = rawRecord as MigratedRecord;
    if (
      !Array.isArray(record.resources) ||
      !AppResourcesSchema.safeParse(record.resources).success
    ) {
      throw new Error(`Invalid resources after migration in ${collectionName} ${record._id}`);
    }
  }
};

const verifyPublishedCaches = async ({
  appCollection,
  latestPublishedResources
}: {
  appCollection: MongoCollection;
  latestPublishedResources: Map<string, AppResourcesType>;
}) => {
  for (const [appId, expectedResources] of latestPublishedResources) {
    const app = await appCollection.findOne(
      { _id: new Types.ObjectId(appId) },
      { projection: { resources: 1 } }
    );
    if (!app || JSON.stringify(app.resources) !== JSON.stringify(expectedResources)) {
      throw new Error(`Published resource cache mismatch for app ${appId}`);
    }
  }
};

/** 管理员 App 资源迁移；默认只扫描校验，dryRun=false 时才写入数据库。 */
export async function runInitAppResourcesMigration(
  params: InitAppResourcesBodyType
): Promise<InitAppResourcesResponseType> {
  const options = InitAppResourcesBodySchema.parse(params);
  const stats = createStats();
  const versionCollection = MongoAppVersion.collection;
  const appCollection = MongoApp.collection;

  // Version 是正式资源事实，先计算最新发布版本，再用它回填 App 缓存。
  const latestPublishedResources = new Map<string, AppResourcesType>();
  await migrateCollection({
    collection: versionCollection,
    stats,
    dryRun: options.dryRun,
    isVersion: true,
    batchSize: options.batchSize,
    writeBatchSize: options.writeBatchSize,
    buildResources: (record) => buildResources({ ...record, stats }),
    onResourcesBuilt: ({ record, resources }) => {
      if (record.isPublish !== true || record.appId === undefined) return;
      const appId = String(record.appId);
      if (!latestPublishedResources.has(appId)) {
        latestPublishedResources.set(appId, resources);
      }
    }
  });

  await migrateCollection({
    collection: appCollection,
    stats,
    dryRun: options.dryRun,
    isVersion: false,
    batchSize: options.batchSize,
    writeBatchSize: options.writeBatchSize,
    buildResources: (record) => {
      const appId = record._id === undefined ? undefined : String(record._id);
      const publishedResources = appId ? latestPublishedResources.get(appId) : undefined;
      if (!publishedResources) return buildResources({ ...record, stats });

      const legacySkillIds = getLegacySkillIds(record.resourceRefs);
      stats.legacySkillRefs += legacySkillIds.length;
      stats.legacySkillMismatches += countMissingLegacySkills({
        legacySkillIds,
        resources: publishedResources
      });
      return publishedResources;
    }
  });

  if (!options.dryRun) {
    await Promise.all([
      verifyResources({
        collection: versionCollection,
        collectionName: MongoAppVersion.collection.name,
        batchSize: options.batchSize
      }),
      verifyResources({
        collection: appCollection,
        collectionName: MongoApp.collection.name,
        batchSize: options.batchSize
      }),
      verifyPublishedCaches({
        appCollection,
        latestPublishedResources
      })
    ]);

    // 只有所有资源和正式发布缓存校验通过后，才删除可用于重试的旧字段。
    await Promise.all([
      cleanupLegacyResourceRefs({
        collection: versionCollection,
        batchSize: options.batchSize,
        writeBatchSize: options.writeBatchSize,
        isVersion: true
      }),
      cleanupLegacyResourceRefs({
        collection: appCollection,
        batchSize: options.batchSize,
        writeBatchSize: options.writeBatchSize,
        isVersion: false
      })
    ]);

    const [remainingApps, remainingVersions] = await Promise.all([
      appCollection.countDocuments({ resourceRefs: { $exists: true } }),
      versionCollection.countDocuments({ resourceRefs: { $exists: true } })
    ]);
    if (remainingApps > 0 || remainingVersions > 0) {
      throw new Error(
        `resourceRefs migration incomplete: apps=${remainingApps}, versions=${remainingVersions}`
      );
    }
  }

  return InitAppResourcesResponseSchema.parse({
    dryRun: options.dryRun,
    batchSize: options.batchSize,
    writeBatchSize: options.writeBatchSize,
    stats
  });
}

async function handler(req: ApiRequestProps): Promise<InitAppResourcesResponseType> {
  await authCert({ req, authRoot: true });
  const { body } = parseApiInput({
    req,
    bodySchema: InitAppResourcesBodySchema
  });
  return runInitAppResourcesMigration(body);
}

export default NextAPI(handler);
