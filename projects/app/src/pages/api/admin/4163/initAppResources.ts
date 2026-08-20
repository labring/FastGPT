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
import type { Types } from '@fastgpt/service/common/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import z from 'zod';

/*
 * API: 初始化 App 资源快照
 * Route: POST /api/admin/4163/initAppResources
 * Method: POST
 * Description: 回填 Version.resources 与 App 正式版本指针，保留旧字段作为兼容和回滚依据。
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
  publishedVersionId?: unknown;
};

type RawVersionPointerRecord = {
  _id?: Types.ObjectId;
  appId?: unknown;
  isPublish?: unknown;
};

type MongoCollection = typeof MongoApp.collection;

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

type VersionUpdate = {
  record: RawWorkflowRecord;
  resources: AppResourcesType;
};

type PointerUpdate = {
  record: RawWorkflowRecord;
  publishedVersionId: Types.ObjectId;
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
  if (isVersion) filter.resources = getSnapshotQueryValue(record.resources);
  if (pointers?.publishedVersionId) {
    filter.publishedVersionId = getSnapshotQueryValue(record.publishedVersionId);
  }
  return filter;
};

const runInWriteBatches = async <Item>(
  items: Item[],
  writeBatchSize: number,
  run: (item: Item) => Promise<void>
) => {
  for (let start = 0; start < items.length; start += writeBatchSize) {
    await Promise.all(items.slice(start, start + writeBatchSize).map(run));
  }
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
  const publishedVersionOwners = new Map<string, string>();
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
    if (record.isPublish === true) {
      publishedVersionOwners.set(String(record._id), appId);
    }
  }

  return { appIdsWithVersions, latestPublishedVersionIds, skippedAppIds, publishedVersionOwners };
};

/**
 * 按固定读取和写入批次回填缺失或非法的 Version 资源快照；
 * 更新条件只包含资源计算所需的读取快照，避免并发保存覆盖用户的新版本。
 */
const migrateVersionResources = async ({
  collection,
  stats,
  dryRun,
  batchSize,
  writeBatchSize,
  buildResources
}: {
  collection: MongoCollection;
  stats: MigrationStats;
  dryRun: boolean;
  batchSize: number;
  writeBatchSize: number;
  buildResources: (record: RawWorkflowRecord) => AppResourcesType;
}) => {
  const skippedRecordIds = new Set<string>();

  const markSkipped = (record: RawWorkflowRecord) => {
    if (record._id !== undefined) skippedRecordIds.add(String(record._id));
    stats.versionsSkipped += 1;
  };

  const flushWrites = (updates: VersionUpdate[]) =>
    runInWriteBatches(updates, writeBatchSize, async ({ record, resources }) => {
      const result = await collection.updateOne(getMigrationUpdateFilter(record, true), {
        $set: { resources }
      });
      if (result.matchedCount === 1) stats.versionsUpdated += 1;
      else markSkipped(record);
    });

  const migrateBatch = async (records: RawWorkflowRecord[]) => {
    const updates: VersionUpdate[] = [];

    records.forEach((record) => {
      stats.versionsScanned += 1;
      if (
        Array.isArray(record.resources) &&
        AppResourcesSchema.safeParse(record.resources).success
      ) {
        stats.legacySkillRefs += getLegacySkillIds(record.resourceRefs).length;
        return;
      }

      const resources = buildResources(record);
      if (dryRun) {
        return;
      }
      if (record._id === undefined) {
        markSkipped(record);
        return;
      }

      updates.push({ record, resources });
    });

    if (!dryRun) await flushWrites(updates);
  };

  const cursor = collection.find({}).sort({ time: -1, _id: -1 }).batchSize(batchSize);
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

/**
 * 回填 publishedVersionId，保留 App 旧图字段作为兼容和回滚依据。
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
  publishedVersionOwners,
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
  publishedVersionOwners: Map<string, string>;
  skippedAppIdsFromVersions: Set<string>;
}) => {
  const markSkipped = () => {
    stats.appsSkipped += 1;
  };

  const flushWrites = (updates: PointerUpdate[]) =>
    runInWriteBatches(
      updates,
      writeBatchSize,
      async ({ record, publishedVersionId, createdVersionId }) => {
        const result = await appCollection.updateOne(
          getMigrationUpdateFilter(record, false, { publishedVersionId }),
          { $set: { publishedVersionId } }
        );
        if (result.matchedCount === 1) {
          stats.appsUpdated += 1;
          return;
        }

        if (createdVersionId) {
          const { deletedCount } = await versionCollection.deleteOne({
            _id: createdVersionId,
            appId: record._id
          });
          if (deletedCount === 1) stats.versionsUpdated -= 1;
        }
        markSkipped();
      }
    );

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
    const updates: PointerUpdate[] = [];

    for (const record of records) {
      stats.appsScanned += 1;
      stats.legacySkillRefs += getLegacySkillIds(record.resourceRefs).length;
      const appId = record._id === undefined ? undefined : String(record._id);
      const currentPublishedVersionId =
        record.publishedVersionId === undefined || record.publishedVersionId === null
          ? undefined
          : String(record.publishedVersionId);

      if (!dryRun && appId && skippedAppIdsFromVersions.has(appId)) {
        markSkipped();
        continue;
      }
      if (dryRun) continue;
      if (record._id === undefined) {
        markSkipped();
        continue;
      }
      if (
        appId &&
        currentPublishedVersionId &&
        publishedVersionOwners.get(currentPublishedVersionId) === appId
      ) {
        continue;
      }

      const folder = isFolderApp(record.type);
      let publishedVersionId = appId ? latestPublishedVersionIds.get(appId) : undefined;
      let createdVersionId: Types.ObjectId | undefined;

      // 零 Version 才用 App 图补建正式版；文件夹没有工作流。
      if (!folder && appId && !appIdsWithVersions.has(appId)) {
        createdVersionId = await createMissingPublishedVersion(record);
        if (!createdVersionId) {
          markSkipped();
          continue;
        }
        publishedVersionId = createdVersionId;
      }

      if (!publishedVersionId) continue;
      updates.push({ record, publishedVersionId, createdVersionId });
    }

    if (!dryRun) await flushWrites(updates);
  };

  const cursor = appCollection
    .find(
      {},
      {
        projection: {
          _id: 1,
          modules: 1,
          edges: 1,
          chatConfig: 1,
          'resourceRefs.skillIds': 1,
          publishedVersionId: 1,
          type: 1,
          tmbId: 1,
          name: 1
        }
      }
    )
    .sort({ _id: 1 })
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

/** 管理员 App 资源迁移；默认只扫描校验，dryRun=false 时才写入数据库。 */
export async function runInitAppResourcesMigration(
  params: InitAppResourcesBodyType
): Promise<InitAppResourcesResponseType> {
  const options = InitAppResourcesBodySchema.parse(params);
  const stats = createStats();
  const versionCollection = MongoAppVersion.collection;
  const appCollection = MongoApp.collection;

  const { skippedRecordIds: skippedVersionIds } = await migrateVersionResources({
    collection: versionCollection,
    stats,
    dryRun: options.dryRun,
    batchSize: options.batchSize,
    writeBatchSize: options.writeBatchSize,
    buildResources: (record) => buildResources({ ...record, stats })
  });
  const { appIdsWithVersions, latestPublishedVersionIds, skippedAppIds, publishedVersionOwners } =
    await getLatestVersionPointers({
      collection: versionCollection,
      batchSize: options.batchSize,
      skippedRecordIds: skippedVersionIds
    });

  await backfillAppVersionPointers({
    appCollection,
    versionCollection,
    stats,
    dryRun: options.dryRun,
    batchSize: options.batchSize,
    writeBatchSize: options.writeBatchSize,
    appIdsWithVersions,
    latestPublishedVersionIds,
    publishedVersionOwners,
    skippedAppIdsFromVersions: skippedAppIds
  });

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
