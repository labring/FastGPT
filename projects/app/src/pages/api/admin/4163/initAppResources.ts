import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { BoolSchema, IntSchema } from '@fastgpt/global/common/zod';
import { AppFolderTypeList } from '@fastgpt/global/core/app/constants';
import { AppResourcesSchema, type AppResourcesType } from '@fastgpt/global/core/app/type';
import { migrateWorkflowToCurrent } from '@fastgpt/global/core/workflow/migration';
import { decodeToolSetNodesFromStorage } from '@fastgpt/service/core/app/jsonSchemaStorage';
import { resolveStoredAppResources, getLegacySkillIds } from '@fastgpt/service/core/app/resources';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { isDeepStrictEqual } from 'node:util';
import z from 'zod';

/*
 * API: 初始化 App 资源快照
 * Route: POST /api/admin/4163/initAppResources
 * Method: POST
 * Description: 回填 Version.resources 与 App 正式版本指针，并清理历史 resourceRefs 与 App 图字段。
 * Tags: ['Admin', 'DataClean', 'App', 'Write']
 */

type LegacyResourceRefs = {
  skillIds?: unknown;
};

const DEFAULT_BATCH_SIZE = 500;
const DEFAULT_WRITE_BATCH_SIZE = 50;

type RawWorkflowRecord = {
  _id?: Types.ObjectId;
  nodes?: unknown;
  modules?: unknown;
  edges?: unknown;
  chatConfig?: unknown;
  resources?: unknown;
  resourceRefs?: LegacyResourceRefs;
  type?: unknown;
  tmbId?: unknown;
  name?: unknown;
};

type RawVersionPointerRecord = {
  _id?: Types.ObjectId;
  appId?: unknown;
  isPublish?: unknown;
};

type MongoCollection = typeof MongoApp.collection;
type MongoBulkWriteOperation = Parameters<MongoCollection['bulkWrite']>[0][number];

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
  appsSkipped: z.number().int().nonnegative(),
  versionsSkipped: z.number().int().nonnegative(),
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

type MigratedRecord = Pick<RawWorkflowRecord, '_id' | 'resources'>;

type MigrationOperation = {
  record: RawWorkflowRecord;
  operation: MongoBulkWriteOperation;
  createdVersionId?: Types.ObjectId;
};

const createStats = (): MigrationStats => ({
  appsScanned: 0,
  versionsScanned: 0,
  appsUpdated: 0,
  versionsUpdated: 0,
  appsSkipped: 0,
  versionsSkipped: 0,
  legacySkillRefs: 0,
  legacySkillMismatches: 0
});

const getWorkflowSnapshot = (record: RawWorkflowRecord, isVersion: boolean) => {
  const snapshot: Record<string, unknown> = {
    edges: record.edges,
    chatConfig: record.chatConfig,
    'resourceRefs.skillIds': record.resourceRefs?.skillIds
  };
  snapshot[isVersion ? 'nodes' : 'modules'] = isVersion ? record.nodes : record.modules;
  return snapshot;
};

const getSnapshotQueryValue = (value: unknown) =>
  value === undefined ? { $exists: false } : { $exists: true, $eq: value };

const getMigrationUpdateFilter = (
  record: RawWorkflowRecord,
  isVersion: boolean,
  pointers?: { publishedVersionId?: Types.ObjectId }
) => {
  const snapshot = getWorkflowSnapshot(record, isVersion);
  const filter = Object.entries(snapshot).reduce<Record<string, unknown>>(
    (nextFilter, [key, value]) => {
      nextFilter[key] = getSnapshotQueryValue(value);
      return nextFilter;
    },
    { _id: record._id }
  );
  // 只回填仍为空或仍是本次扫描结果的正式指针，避免覆盖并发发布结果。
  const pointerFilters = [
    pointers?.publishedVersionId
      ? {
          $or: [
            { publishedVersionId: { $exists: false } },
            { publishedVersionId: null },
            { publishedVersionId: pointers.publishedVersionId }
          ]
        }
      : undefined
  ].filter(Boolean);
  if (pointerFilters.length > 0) {
    filter.$and = pointerFilters;
  }
  return filter;
};

const getSnapshotProjection = (isVersion: boolean) =>
  Object.keys(getWorkflowSnapshot({}, isVersion)).reduce<Record<string, 1>>(
    (projection, key) => {
      projection[key] = 1;
      return projection;
    },
    { _id: 1 }
  );

const isWorkflowSnapshotUnchanged = ({
  record,
  currentRecord,
  isVersion
}: {
  record: RawWorkflowRecord;
  currentRecord?: RawWorkflowRecord;
  isVersion: boolean;
}) => {
  if (!currentRecord) return false;
  const expectedSnapshot = getWorkflowSnapshot(record, isVersion);
  const currentSnapshot = getWorkflowSnapshot(currentRecord, isVersion);
  return Object.entries(expectedSnapshot).every(([key, value]) =>
    isDeepStrictEqual(value, currentSnapshot[key])
  );
};

const getObjectIdList = (ids: Set<string>) => Array.from(ids, (id) => new Types.ObjectId(id));

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

const isFolderApp = (type: unknown) =>
  typeof type === 'string' &&
  AppFolderTypeList.includes(type as (typeof AppFolderTypeList)[number]);

/** 从原始 Mongo 记录读取工作流节点，兼容旧对象 Schema 和新版字符串 Schema。 */
const getDecodedWorkflowNodes = ({
  nodes,
  modules
}: Pick<RawWorkflowRecord, 'nodes' | 'modules'>) => {
  const storedNodes = Array.isArray(nodes) ? nodes : Array.isArray(modules) ? modules : [];
  return decodeToolSetNodesFromStorage(storedNodes);
};

const buildResources = ({
  nodes,
  modules,
  edges,
  chatConfig,
  resources,
  resourceRefs,
  stats
}: RawWorkflowRecord & { stats: MigrationStats }): AppResourcesType => {
  const workflowNodes = getDecodedWorkflowNodes({ nodes, modules });
  const legacySkillIds = getLegacySkillIds(resourceRefs);
  stats.legacySkillRefs += legacySkillIds.length;

  const normalizedWorkflow = migrateWorkflowToCurrent({
    nodes: workflowNodes,
    edges: Array.isArray(edges) ? edges : [],
    chatConfig
  });
  const resolved = resolveStoredAppResources({
    resources,
    nodes: normalizedWorkflow.nodes,
    chatConfig: normalizedWorkflow.chatConfig,
    resourceRefs
  });
  stats.legacySkillMismatches += countMissingLegacySkills({
    legacySkillIds,
    resources: resolved
  });
  return resolved;
};

/**
 * 按 time 倒序选出每个 App 最新正式 Version，并记录是否存在任意 Version。
 * 最新工作 Version 或最新正式 Version 被 OCC 跳过时，整 App 的指针回填推迟到下次重试。
 */
const getLatestVersionPointers = async ({
  collection,
  batchSize,
  skippedRecordIds
}: {
  collection: MongoCollection;
  batchSize: number;
  skippedRecordIds: Set<string>;
}) => {
  const appIdsWithVersions = new Set<string>();
  const latestPublishedVersionIds = new Map<string, Types.ObjectId>();
  const skippedAppIds = new Set<string>();
  const seenVersionAppIds = new Set<string>();
  const seenPublishedAppIds = new Set<string>();
  const cursor = collection
    .find({}, { projection: { _id: 1, appId: 1, isPublish: 1 } })
    .sort({ time: -1, _id: -1 })
    .batchSize(batchSize);

  for await (const rawRecord of cursor) {
    const record = rawRecord as RawVersionPointerRecord;
    if (record.appId === undefined || record._id === undefined) continue;
    const appId = String(record.appId);
    const skipped = skippedRecordIds.has(String(record._id));
    appIdsWithVersions.add(appId);
    if (!seenVersionAppIds.has(appId)) {
      seenVersionAppIds.add(appId);
      if (skipped) skippedAppIds.add(appId);
    }

    if (record.isPublish === true && !seenPublishedAppIds.has(appId)) {
      seenPublishedAppIds.add(appId);
      if (skipped) skippedAppIds.add(appId);
      else latestPublishedVersionIds.set(appId, record._id);
    }
  }

  return { appIdsWithVersions, latestPublishedVersionIds, skippedAppIds };
};

/**
 * 按固定读取和写入批次迁移单个集合，先计算完整批次资源再批量写入；
 * 更新条件只包含资源计算所需的读取快照，避免并发保存覆盖用户的新版本。
 */
const migrateCollection = async ({
  collection,
  stats,
  dryRun,
  isVersion,
  batchSize,
  writeBatchSize,
  buildResources,
  shouldSkipRecord
}: {
  collection: MongoCollection;
  stats: MigrationStats;
  dryRun: boolean;
  isVersion: boolean;
  batchSize: number;
  writeBatchSize: number;
  buildResources: (record: RawWorkflowRecord) => AppResourcesType;
  shouldSkipRecord?: (record: RawWorkflowRecord) => boolean;
}) => {
  const skippedRecordIds = new Set<string>();
  const migratedResources = new Map<string, AppResourcesType>();

  const markSkipped = (record: RawWorkflowRecord) => {
    if (record._id !== undefined) skippedRecordIds.add(String(record._id));
    if (isVersion) stats.versionsSkipped += 1;
    else stats.appsSkipped += 1;
  };

  const flushWrites = async (operations: MigrationOperation[]) => {
    for (let start = 0; start < operations.length; start += writeBatchSize) {
      const batchOperations = operations.slice(start, start + writeBatchSize);
      await collection.bulkWrite(
        batchOperations.map(({ operation }) => operation),
        { ordered: false }
      );

      // bulkWrite 只返回批次汇总结果，写入后重新读取快照才能识别具体被并发修改的记录。
      const currentRecords = await collection
        .find(
          {
            _id: {
              $in: batchOperations
                .map(({ record }) => record._id)
                .filter((id): id is Types.ObjectId => id !== undefined)
            }
          },
          { projection: getSnapshotProjection(isVersion) }
        )
        .toArray();
      const currentRecordMap = new Map(
        currentRecords.map((record) => [String(record._id), record as RawWorkflowRecord])
      );
      let skippedCount = 0;

      batchOperations.forEach(({ record }) => {
        if (
          !isWorkflowSnapshotUnchanged({
            record,
            currentRecord: currentRecordMap.get(String(record._id)),
            isVersion
          })
        ) {
          skippedCount += 1;
          markSkipped(record);
          return;
        }
      });

      const updatedCount = batchOperations.length - skippedCount;
      if (isVersion) stats.versionsUpdated += updatedCount;
      else stats.appsUpdated += updatedCount;
    }
  };

  const migrateBatch = async (records: RawWorkflowRecord[]) => {
    const operations: MigrationOperation[] = [];

    records.forEach((record) => {
      if (isVersion) stats.versionsScanned += 1;
      else stats.appsScanned += 1;

      if (!dryRun && shouldSkipRecord?.(record)) {
        stats.legacySkillRefs += getLegacySkillIds(record.resourceRefs).length;
        markSkipped(record);
        return;
      }

      const resources = buildResources(record);
      if (dryRun && record._id !== undefined) {
        migratedResources.set(String(record._id), resources);
      }
      if (dryRun) {
        return;
      }
      if (record._id === undefined) {
        markSkipped(record);
        return;
      }

      operations.push({
        record,
        operation: {
          updateOne: {
            filter: getMigrationUpdateFilter(record, isVersion),
            update: {
              $set: { resources }
            }
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

  return { skippedRecordIds, migratedResources };
};

/** 资源迁移和全量校验完成后，按批次清理历史 resourceRefs 字段。 */
const cleanupLegacyResourceRefs = async ({
  collection,
  batchSize,
  writeBatchSize,
  isVersion,
  excludedRecordIds
}: {
  collection: MongoCollection;
  batchSize: number;
  writeBatchSize: number;
  isVersion: boolean;
  excludedRecordIds: Set<string>;
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

  const excludedObjectIds = getObjectIdList(excludedRecordIds);
  const cursor = collection
    .find(
      {
        resourceRefs: { $exists: true },
        ...(excludedObjectIds.length > 0 ? { _id: { $nin: excludedObjectIds } } : {})
      },
      { projection: { _id: 1 } }
    )
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
  batchSize,
  skippedRecordIds
}: {
  collection: MongoCollection;
  collectionName: string;
  batchSize: number;
  skippedRecordIds: Set<string>;
}) => {
  const cursor = collection.find({}, { projection: { _id: 1, resources: 1 } }).batchSize(batchSize);
  for await (const rawRecord of cursor) {
    const record = rawRecord as MigratedRecord;
    if (record._id !== undefined && skippedRecordIds.has(String(record._id))) continue;
    if (
      !Array.isArray(record.resources) ||
      !AppResourcesSchema.safeParse(record.resources).success
    ) {
      throw new Error(`Invalid resources after migration in ${collectionName} ${record._id}`);
    }
  }
};

/**
 * 回填 publishedVersionId，并 $unset App 图字段。
 * 仅当该 App 一条 Version 都没有时，才用当前 App 图补建一条正式 Version。
 */
const backfillAppVersionPointers = async ({
  appCollection,
  versionCollection,
  stats,
  dryRun,
  batchSize,
  writeBatchSize,
  appIdsWithVersions,
  latestPublishedVersionIds,
  skippedAppIdsFromVersions
}: {
  appCollection: MongoCollection;
  versionCollection: MongoCollection;
  stats: MigrationStats;
  dryRun: boolean;
  batchSize: number;
  writeBatchSize: number;
  appIdsWithVersions: Set<string>;
  latestPublishedVersionIds: Map<string, Types.ObjectId>;
  skippedAppIdsFromVersions: Set<string>;
}) => {
  const skippedRecordIds = new Set<string>();

  const markSkipped = (record: RawWorkflowRecord) => {
    if (record._id !== undefined) skippedRecordIds.add(String(record._id));
    stats.appsSkipped += 1;
  };

  const flushWrites = async (operations: MigrationOperation[]) => {
    for (let start = 0; start < operations.length; start += writeBatchSize) {
      const batchOperations = operations.slice(start, start + writeBatchSize);
      await appCollection.bulkWrite(
        batchOperations.map(({ operation }) => operation),
        { ordered: false }
      );

      const currentRecords = await appCollection
        .find(
          {
            _id: {
              $in: batchOperations
                .map(({ record }) => record._id)
                .filter((id): id is Types.ObjectId => id !== undefined)
            }
          },
          { projection: { _id: 1, resourceRefs: 1, publishedVersionId: 1 } }
        )
        .toArray();
      const currentRecordMap = new Map(
        currentRecords.map((record) => [
          String(record._id),
          record as RawWorkflowRecord & {
            publishedVersionId?: Types.ObjectId;
          }
        ])
      );
      let skippedCount = 0;

      for (const { record, operation, createdVersionId } of batchOperations) {
        const currentRecord = currentRecordMap.get(String(record._id));
        const expectedSet =
          'updateOne' in operation && !Array.isArray(operation.updateOne.update)
            ? (
                operation.updateOne.update as {
                  $set?: {
                    publishedVersionId?: Types.ObjectId;
                  };
                }
              ).$set
            : undefined;
        const pointerApplied =
          !!currentRecord &&
          (!expectedSet?.publishedVersionId ||
            String(currentRecord.publishedVersionId) === String(expectedSet.publishedVersionId));
        // 指针回填会 $unset 图字段，不能再用 modules 快照做 OCC。
        if (
          !pointerApplied ||
          !isDeepStrictEqual(record.resourceRefs?.skillIds, currentRecord?.resourceRefs?.skillIds)
        ) {
          skippedCount += 1;
          // 只有指针没有回填成功时才能清理本次新建 Version；指针已生效时保留它，避免产生悬空指针。
          if (!pointerApplied && createdVersionId) {
            const { deletedCount } = await versionCollection.deleteOne({
              _id: createdVersionId,
              appId: record._id
            });
            if (deletedCount === 1) stats.versionsUpdated -= 1;
          }
          markSkipped(record);
        }
      }

      stats.appsUpdated += batchOperations.length - skippedCount;
    }
  };

  const createMissingPublishedVersion = async (record: RawWorkflowRecord) => {
    if (record._id === undefined || record.tmbId === undefined) return;
    const workflowNodes = Array.isArray(record.modules) ? record.modules : [];
    const normalizedWorkflow = migrateWorkflowToCurrent({
      nodes: decodeToolSetNodesFromStorage(workflowNodes),
      edges: Array.isArray(record.edges) ? record.edges : [],
      chatConfig: record.chatConfig
    });
    const resources = resolveStoredAppResources({
      nodes: normalizedWorkflow.nodes,
      chatConfig: normalizedWorkflow.chatConfig,
      resourceRefs: record.resourceRefs
    });
    const result = await versionCollection.insertOne({
      tmbId: String(record.tmbId),
      appId: record._id,
      time: new Date(),
      nodes: normalizedWorkflow.nodes,
      edges: normalizedWorkflow.edges,
      chatConfig: normalizedWorkflow.chatConfig,
      isPublish: true,
      versionName: typeof record.name === 'string' ? record.name : undefined,
      resources
    });
    stats.versionsUpdated += 1;
    return result.insertedId;
  };

  const migrateBatch = async (records: RawWorkflowRecord[]) => {
    const operations: MigrationOperation[] = [];

    for (const record of records) {
      stats.appsScanned += 1;
      stats.legacySkillRefs += getLegacySkillIds(record.resourceRefs).length;
      const appId = record._id === undefined ? undefined : String(record._id);

      if (!dryRun && appId && skippedAppIdsFromVersions.has(appId)) {
        markSkipped(record);
        continue;
      }
      if (dryRun) continue;
      if (record._id === undefined) {
        markSkipped(record);
        continue;
      }

      const folder = isFolderApp(record.type);
      let publishedVersionId = appId ? latestPublishedVersionIds.get(appId) : undefined;
      let createdVersionId: Types.ObjectId | undefined;

      // 零 Version 才用 App 图补建正式版；文件夹没有工作流。
      if (!folder && appId && !appIdsWithVersions.has(appId)) {
        createdVersionId = await createMissingPublishedVersion(record);
        if (!createdVersionId) {
          markSkipped(record);
          continue;
        }
        publishedVersionId = createdVersionId;
      }

      const $set: Record<string, unknown> = {};
      if (publishedVersionId) $set.publishedVersionId = publishedVersionId;

      operations.push({
        record,
        createdVersionId,
        operation: {
          updateOne: {
            filter: getMigrationUpdateFilter(record, false, {
              publishedVersionId
            }),
            update: {
              ...(Object.keys($set).length > 0 ? { $set } : {}),
              $unset: { modules: 1, edges: 1, chatConfig: 1 }
            }
          }
        }
      });
    }

    if (!dryRun) await flushWrites(operations);
  };

  const cursor = appCollection.find({}).sort({ _id: 1 }).batchSize(batchSize);
  let records: RawWorkflowRecord[] = [];

  for await (const rawRecord of cursor) {
    records.push(rawRecord as RawWorkflowRecord);
    if (records.length < batchSize) continue;
    await migrateBatch(records);
    records = [];
  }
  if (records.length > 0) await migrateBatch(records);

  return { skippedRecordIds };
};

/** 管理员 App 资源迁移；默认只扫描校验，dryRun=false 时才写入数据库。 */
export async function runInitAppResourcesMigration(
  params: InitAppResourcesBodyType
): Promise<InitAppResourcesResponseType> {
  const options = InitAppResourcesBodySchema.parse(params);
  const stats = createStats();
  const versionCollection = MongoAppVersion.collection;
  const appCollection = MongoApp.collection;

  const { skippedRecordIds: skippedVersionIds } = await migrateCollection({
    collection: versionCollection,
    stats,
    dryRun: options.dryRun,
    isVersion: true,
    batchSize: options.batchSize,
    writeBatchSize: options.writeBatchSize,
    buildResources: (record) => buildResources({ ...record, stats })
  });
  const { appIdsWithVersions, latestPublishedVersionIds, skippedAppIds } =
    await getLatestVersionPointers({
      collection: versionCollection,
      batchSize: options.batchSize,
      skippedRecordIds: skippedVersionIds
    });

  const { skippedRecordIds: skippedAppIdsFromPointer } = await backfillAppVersionPointers({
    appCollection,
    versionCollection,
    stats,
    dryRun: options.dryRun,
    batchSize: options.batchSize,
    writeBatchSize: options.writeBatchSize,
    appIdsWithVersions,
    latestPublishedVersionIds,
    skippedAppIdsFromVersions: skippedAppIds
  });

  if (!options.dryRun) {
    await verifyResources({
      collection: versionCollection,
      collectionName: MongoAppVersion.collection.name,
      batchSize: options.batchSize,
      skippedRecordIds: skippedVersionIds
    });

    await Promise.all([
      cleanupLegacyResourceRefs({
        collection: versionCollection,
        batchSize: options.batchSize,
        writeBatchSize: options.writeBatchSize,
        isVersion: true,
        excludedRecordIds: skippedVersionIds
      }),
      cleanupLegacyResourceRefs({
        collection: appCollection,
        batchSize: options.batchSize,
        writeBatchSize: options.writeBatchSize,
        isVersion: false,
        excludedRecordIds: skippedAppIdsFromPointer
      })
    ]);

    const [remainingApps, remainingVersions] = await Promise.all([
      appCollection.countDocuments({ resourceRefs: { $exists: true } }),
      versionCollection.countDocuments({ resourceRefs: { $exists: true } })
    ]);
    const skippedAppCount = await appCollection.countDocuments({
      _id: { $in: getObjectIdList(skippedAppIdsFromPointer) },
      resourceRefs: { $exists: true }
    });
    const skippedVersionCount = await versionCollection.countDocuments({
      _id: { $in: getObjectIdList(skippedVersionIds) },
      resourceRefs: { $exists: true }
    });
    if (remainingApps > skippedAppCount || remainingVersions > skippedVersionCount) {
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
