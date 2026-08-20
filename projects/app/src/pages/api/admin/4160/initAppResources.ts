import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { BoolSchema } from '@fastgpt/global/common/zod';
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
 * Route: POST /api/admin/4160/initAppResources
 * Method: POST
 * Description: 回填 App 与 App Version 的 resources，并清理历史 resourceRefs。
 * Tags: ['Admin', 'DataClean', 'App', 'Write']
 */

type LegacyResourceRefs = {
  skillIds?: unknown;
};

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
  dryRun: BoolSchema.optional().default(true)
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
  stats: AppResourcesMigrationStatsSchema
});
export type InitAppResourcesResponseType = z.infer<typeof InitAppResourcesResponseSchema>;

type MigratedRecord = Pick<RawWorkflowRecord, '_id' | 'resources' | 'resourceRefs'>;

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

const migrateCollection = async ({
  collection,
  stats,
  dryRun,
  isVersion
}: {
  collection: MongoCollection;
  stats: MigrationStats;
  dryRun: boolean;
  isVersion: boolean;
}) => {
  const latestPublishedResources = new Map<string, AppResourcesType>();
  // 必须与 getAppLatestVersion 的现有 { time: -1 } 选择规则一致，不引入新的版本排序语义。
  const cursor = collection.find({}).sort({ time: -1 });

  for await (const rawRecord of cursor) {
    const record = rawRecord as RawWorkflowRecord;
    if (isVersion) stats.versionsScanned += 1;
    else stats.appsScanned += 1;

    const resources = buildResources({ ...record, stats });
    if (isVersion && record.isPublish === true && record.appId !== undefined) {
      const appId = String(record.appId);
      if (!latestPublishedResources.has(appId)) latestPublishedResources.set(appId, resources);
    }

    if (dryRun) continue;
    const result = await collection.updateOne(
      { _id: record._id },
      {
        $set: { resources },
        $unset: { resourceRefs: 1 }
      }
    );
    if (result.matchedCount !== 1) {
      throw new Error(`Migration update missed ${isVersion ? 'version' : 'app'} ${record._id}`);
    }
    if (isVersion) stats.versionsUpdated += 1;
    else stats.appsUpdated += 1;
  }

  return latestPublishedResources;
};

const verifyResources = async ({
  collection,
  collectionName
}: {
  collection: MongoCollection;
  collectionName: string;
}) => {
  for await (const rawRecord of collection.find({}, { projection: { _id: 1, resources: 1 } })) {
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
  const stats = createStats();
  const versionCollection = MongoAppVersion.collection;
  const appCollection = MongoApp.collection;

  // Version 是正式资源事实，先计算最新发布版本，再用它回填 App 缓存。
  const latestPublishedResources = await migrateCollection({
    collection: versionCollection,
    stats,
    dryRun: params.dryRun,
    isVersion: true
  });

  const appCursor = appCollection.find({}).sort({ _id: 1 });
  for await (const rawRecord of appCursor) {
    const record = rawRecord as RawWorkflowRecord;
    stats.appsScanned += 1;
    const appId = record._id === undefined ? undefined : String(record._id);
    if (appId && latestPublishedResources.has(appId)) {
      const legacySkillIds = getLegacySkillIds(record.resourceRefs);
      stats.legacySkillRefs += legacySkillIds.length;
      stats.legacySkillMismatches += countMissingLegacySkills({
        legacySkillIds,
        resources: latestPublishedResources.get(appId)!
      });
    }
    const resources =
      appId && latestPublishedResources.has(appId)
        ? latestPublishedResources.get(appId)!
        : buildResources({ ...record, stats });

    if (params.dryRun) continue;
    const result = await appCollection.updateOne(
      { _id: record._id },
      {
        $set: { resources },
        $unset: { resourceRefs: 1 }
      }
    );
    if (result.matchedCount !== 1) {
      throw new Error(`Migration update missed app ${record._id}`);
    }
    stats.appsUpdated += 1;
  }

  if (!params.dryRun) {
    await Promise.all([
      verifyResources({
        collection: versionCollection,
        collectionName: MongoAppVersion.collection.name
      }),
      verifyResources({
        collection: appCollection,
        collectionName: MongoApp.collection.name
      }),
      verifyPublishedCaches({
        appCollection,
        latestPublishedResources
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
    dryRun: params.dryRun,
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
