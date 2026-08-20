import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import { AppResourcesSchema, type AppResourcesType } from '@fastgpt/global/core/app/type';
import type { AppSchemaType } from '@fastgpt/global/core/app/type';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { normalizeWorkflowConfig } from '@fastgpt/global/core/workflow/utils';
import { extractAppResources, mergeAppResources } from '@fastgpt/service/core/app/resources';

const APP_COLLECTION = 'apps';
const APP_VERSION_COLLECTION = 'app_versions';

type LegacyResourceRefs = {
  skillIds?: unknown;
};

type RawWorkflowRecord = {
  _id?: mongoose.Types.ObjectId;
  appId?: unknown;
  isPublish?: unknown;
  nodes?: unknown;
  modules?: unknown;
  edges?: unknown;
  chatConfig?: unknown;
  resources?: unknown;
  resourceRefs?: LegacyResourceRefs;
};

type MigrationOptions = {
  dryRun: boolean;
  uri: string;
};

type MigrationStats = {
  appsScanned: number;
  versionsScanned: number;
  appsUpdated: number;
  versionsUpdated: number;
  legacySkillRefs: number;
  legacySkillMismatches: number;
};

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
  return AppResourcesSchema.parse(
    mergeAppResources([
      ...extracted,
      ...legacySkillIds.map((id) => ({ type: 'skill' as const, id }))
    ])
  );
};

const parseOptions = (args: string[]): MigrationOptions => {
  let dryRun = true;

  for (const arg of args[0] === '--' ? args.slice(1) : args) {
    if (arg === '--execute') {
      dryRun = false;
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'Usage:',
          '  MONGODB_URI=<uri> pnpm --filter @fastgpt/app run migrate:app-resources -- [--dry-run|--execute]',
          '',
          'The default mode is dry-run. Use --execute to write resources and remove resourceRefs.',
          'Run the dry-run once and inspect the migration output before executing it.'
        ].join('\n')
      );
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  return { dryRun, uri };
};

type MongoCollection = ReturnType<NonNullable<typeof mongoose.connection.db>['collection']>;

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
  const cursor = collection.find({}).sort({ time: -1, _id: -1 });

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
      { _id: new mongoose.Types.ObjectId(appId) },
      { projection: { resources: 1 } }
    );
    if (!app || JSON.stringify(app.resources) !== JSON.stringify(expectedResources)) {
      throw new Error(`Published resource cache mismatch for app ${appId}`);
    }
  }
};

const run = async ({ dryRun, uri }: MigrationOptions) => {
  await mongoose.connect(uri);

  try {
    const database = mongoose.connection.db;
    if (!database) throw new Error('MongoDB database connection is unavailable');

    const stats = createStats();
    const versionCollection = database.collection(APP_VERSION_COLLECTION);
    const appCollection = database.collection(APP_COLLECTION);

    // Version 是正式资源事实，先计算最新发布版本，再用它回填 App 缓存。
    const latestPublishedResources = await migrateCollection({
      collection: versionCollection,
      stats,
      dryRun,
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
        (appId && latestPublishedResources.get(appId)) || buildResources({ ...record, stats });

      if (dryRun) continue;
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

    if (!dryRun) {
      await Promise.all([
        verifyResources({
          collection: versionCollection,
          collectionName: APP_VERSION_COLLECTION
        }),
        verifyResources({
          collection: appCollection,
          collectionName: APP_COLLECTION
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

    console.log(
      JSON.stringify(
        {
          mode: dryRun ? 'dry-run' : 'execute',
          appCollection: APP_COLLECTION,
          versionCollection: APP_VERSION_COLLECTION,
          stats
        },
        null,
        2
      )
    );
  } finally {
    await mongoose.disconnect();
  }
};

const isMain =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  void run(parseOptions(process.argv.slice(2))).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
