import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import mongoose from 'mongoose';
import {
  DatasetSynonymMappingSourceEnum,
  DatasetSynonymSchemaVersion
} from '@fastgpt/global/core/dataset/synonym';
import {
  normalizeSynonymInputMappings,
  normalizeSynonymTerm
} from '@fastgpt/service/core/dataset/synonym/utils';

const CONFIG_COLLECTION = 'dataset_synonyms';
const MAPPING_COLLECTION = 'dataset_synonym_mappings';
const LEGACY_VERSION = 1;
const DEFAULT_BATCH_SIZE = 500;

export type LegacySynonymConfigRecord = {
  _id?: unknown;
  teamId?: unknown;
  datasetId?: unknown;
  schemaVersion?: unknown;
  activeVersion?: unknown;
  latestVersion?: unknown;
  version?: unknown;
  enabled?: unknown;
};

export type LegacySynonymMappingRecord = {
  _id?: unknown;
  teamId?: unknown;
  datasetId?: unknown;
  synonymFileId?: unknown;
  fileVersion?: unknown;
  logicalMappingId?: unknown;
  standardizedTerm?: unknown;
  normalizedStandardizedTerm?: unknown;
  synonymTerms?: unknown;
  normalizedSynonymTerms?: unknown;
  fingerprint?: unknown;
  createTime?: unknown;
  updateTime?: unknown;
  createdTime?: unknown;
  updatedTime?: unknown;
};

type MigrationOptions = {
  dryRun: boolean;
  uri: string;
  batchSize: number;
};

type MigrationIssue = {
  teamId?: string;
  datasetId?: string;
  configId?: string;
  reason: string;
};

type MigrationStats = {
  configsScanned: number;
  datasetsReady: number;
  datasetsMigrated: number;
  datasetsWouldMigrate: number;
  alreadyMigrated: number;
  emptyConfigsMigrated: number;
  duplicateConfigs: number;
  orphanMappingGroups: number;
  conflictDatasets: number;
  failedDatasets: number;
  mappingsScanned: number;
  mappingsUpdated: number;
  mappingsWouldUpdate: number;
};

type PreparedLegacyMapping = {
  _id: mongoose.Types.ObjectId;
  logicalMappingId: mongoose.Types.ObjectId;
  fileVersion: number;
  standardizedTerm: string;
  normalizedStandardizedTerm: string;
  synonymTerms: string[];
  normalizedSynonymTerms: string[];
  allTerms: string;
  fingerprint: string;
  source: DatasetSynonymMappingSourceEnum.legacyMigration;
  createTime: Date;
  updateTime: Date;
};

export type LegacySynonymMigrationPlan =
  | { kind: 'empty' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'ready'; mappings: PreparedLegacyMapping[]; contentHash: string };

/** 当前结构的配置必须带显式版本标记，migration 重跑时据此跳过在线创建的数据。 */
export const isDatasetSynonymConfigMigrated = (config: LegacySynonymConfigRecord) =>
  config.schemaVersion === DatasetSynonymSchemaVersion;

const createStats = (): MigrationStats => ({
  configsScanned: 0,
  datasetsReady: 0,
  datasetsMigrated: 0,
  datasetsWouldMigrate: 0,
  alreadyMigrated: 0,
  emptyConfigsMigrated: 0,
  duplicateConfigs: 0,
  orphanMappingGroups: 0,
  conflictDatasets: 0,
  failedDatasets: 0,
  mappingsScanned: 0,
  mappingsUpdated: 0,
  mappingsWouldUpdate: 0
});

const toObjectId = (value: unknown) => {
  if (!mongoose.isValidObjectId(value)) return undefined;
  return new mongoose.Types.ObjectId(String(value));
};

const toDate = (value: unknown) => {
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const getRecordTime = ({
  preferred,
  fallback,
  objectId
}: {
  preferred: unknown;
  fallback: unknown;
  objectId: mongoose.Types.ObjectId;
}) => toDate(preferred) ?? toDate(fallback) ?? objectId.getTimestamp();

/** 对迁移后的稳定业务字段计算 hash，用于 config 切换前后的完整性校验。 */
export const hashPreparedLegacyMappings = (
  mappings: Array<
    Pick<
      PreparedLegacyMapping,
      | '_id'
      | 'logicalMappingId'
      | 'standardizedTerm'
      | 'normalizedStandardizedTerm'
      | 'synonymTerms'
      | 'normalizedSynonymTerms'
      | 'fingerprint'
    >
  >
) =>
  createHash('sha256')
    .update(
      JSON.stringify(
        [...mappings]
          .sort((a, b) => String(a._id).localeCompare(String(b._id)))
          .map((mapping) => ({
            _id: String(mapping._id),
            logicalMappingId: String(mapping.logicalMappingId),
            standardizedTerm: mapping.standardizedTerm,
            normalizedStandardizedTerm: mapping.normalizedStandardizedTerm,
            synonymTerms: mapping.synonymTerms,
            normalizedSynonymTerms: mapping.normalizedSynonymTerms,
            fingerprint: mapping.fingerprint
          }))
      )
    )
    .digest('hex');

/**
 * 将单个 legacy config 下的 mappings 转成确定性的版本 1 更新计划。任何归一化后
 * 会合并、跨组冲突或归属不一致的数据都拒绝迁移，交由管理员修复后重跑。
 */
export const prepareLegacySynonymMigration = ({
  config,
  mappings
}: {
  config: LegacySynonymConfigRecord;
  mappings: LegacySynonymMappingRecord[];
}): LegacySynonymMigrationPlan => {
  if (mappings.length === 0) return { kind: 'empty' };

  const configId = toObjectId(config._id);
  const teamId = toObjectId(config.teamId);
  const datasetId = toObjectId(config.datasetId);
  if (!configId || !teamId || !datasetId) {
    return { kind: 'invalid', reason: 'config 缺少有效的 _id/teamId/datasetId' };
  }

  const sourceRecords: Array<{
    record: LegacySynonymMappingRecord;
    mappingId: mongoose.Types.ObjectId;
    standardizedTerm: string;
    synonymTerms: string[];
  }> = [];
  for (const record of mappings) {
    const mappingId = toObjectId(record._id);
    if (!mappingId) return { kind: 'invalid', reason: 'mapping 包含无效 _id' };
    if (
      String(record.teamId) !== String(teamId) ||
      String(record.datasetId) !== String(datasetId)
    ) {
      return {
        kind: 'invalid',
        reason: `mapping ${mappingId} 的 teamId/datasetId 与 config 不一致`
      };
    }
    if (String(record.synonymFileId) !== String(configId)) {
      return { kind: 'invalid', reason: `mapping ${mappingId} 的 synonymFileId 与 config 不一致` };
    }
    if (record.fileVersion !== undefined && record.fileVersion !== LEGACY_VERSION) {
      return { kind: 'invalid', reason: `mapping ${mappingId} 已存在非 legacy 版本` };
    }
    if (
      typeof record.standardizedTerm !== 'string' ||
      !Array.isArray(record.synonymTerms) ||
      record.synonymTerms.some((term) => typeof term !== 'string')
    ) {
      return { kind: 'invalid', reason: `mapping ${mappingId} 缺少有效标准词或同义词数组` };
    }
    sourceRecords.push({
      record,
      mappingId,
      standardizedTerm: record.standardizedTerm,
      synonymTerms: record.synonymTerms as string[]
    });
  }

  try {
    const normalized = normalizeSynonymInputMappings(
      sourceRecords.map(({ standardizedTerm, synonymTerms }) => ({
        standardizedTerm,
        synonymTerms
      }))
    );
    if (normalized.length !== sourceRecords.length) {
      return { kind: 'invalid', reason: '多个 legacy mapping 归一化后标准词重复' };
    }
    const normalizedMap = new Map(
      normalized.map((mapping) => [mapping.normalizedStandardizedTerm, mapping])
    );
    const prepared = sourceRecords.map(({ record, mappingId, standardizedTerm }) => {
      const mapping = normalizedMap.get(normalizeSynonymTerm(standardizedTerm));
      if (!mapping) throw new Error(`mapping ${mappingId} 规范化结果缺失`);
      const createTime = getRecordTime({
        preferred: record.createTime,
        fallback: record.createdTime,
        objectId: mappingId
      });
      return {
        _id: mappingId,
        logicalMappingId: mappingId,
        fileVersion: LEGACY_VERSION,
        standardizedTerm: mapping.standardizedTerm,
        normalizedStandardizedTerm: mapping.normalizedStandardizedTerm,
        synonymTerms: mapping.synonymTerms,
        normalizedSynonymTerms: mapping.normalizedSynonymTerms,
        allTerms: mapping.allTerms,
        fingerprint: mapping.fingerprint,
        source: DatasetSynonymMappingSourceEnum.legacyMigration,
        createTime,
        updateTime: getRecordTime({
          preferred: record.updateTime,
          fallback: record.updatedTime ?? createTime,
          objectId: mappingId
        })
      } satisfies PreparedLegacyMapping;
    });
    return {
      kind: 'ready',
      mappings: prepared,
      contentHash: hashPreparedLegacyMappings(prepared)
    };
  } catch (error) {
    return {
      kind: 'invalid',
      reason: error instanceof Error ? error.message : String(error)
    };
  }
};

const parseOptions = (args: string[]): MigrationOptions => {
  let dryRun = true;
  let batchSize = DEFAULT_BATCH_SIZE;
  const normalizedArgs = args[0] === '--' ? args.slice(1) : args;

  for (let index = 0; index < normalizedArgs.length; index += 1) {
    const arg = normalizedArgs[index];
    if (arg === '--execute') {
      dryRun = false;
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--batch-size') {
      const value = Number(normalizedArgs[index + 1]);
      if (!Number.isInteger(value) || value < 1 || value > 5000) {
        throw new Error('--batch-size must be an integer between 1 and 5000');
      }
      batchSize = value;
      index += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'Usage:',
          '  MONGODB_URI=<uri> pnpm --filter @fastgpt/app migrate:dataset-synonym-mongo-only -- [--dry-run|--execute] [--batch-size 500]',
          '',
          'Default mode is dry-run. Stop all FastGPT app and worker writes before --execute.',
          'The migration never reads or deletes legacy S3 files.'
        ].join('\n')
      );
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  return { dryRun, uri, batchSize };
};

type MongoCollection = ReturnType<NonNullable<typeof mongoose.connection.db>['collection']>;

const migratePreparedMappings = async ({
  collection,
  plan,
  batchSize
}: {
  collection: MongoCollection;
  plan: Extract<LegacySynonymMigrationPlan, { kind: 'ready' }>;
  batchSize: number;
}) => {
  for (let start = 0; start < plan.mappings.length; start += batchSize) {
    const batch = plan.mappings.slice(start, start + batchSize);
    await collection.bulkWrite(
      batch.map(({ _id, ...fields }) => ({
        updateOne: {
          filter: { _id },
          update: { $set: fields }
        }
      })),
      { ordered: true }
    );
  }
};

const run = async ({ dryRun, uri, batchSize }: MigrationOptions) => {
  await mongoose.connect(uri);
  const stats = createStats();
  const issues: MigrationIssue[] = [];

  try {
    const database = mongoose.connection.db;
    if (!database) throw new Error('MongoDB database connection is unavailable');
    const configCollection = database.collection(CONFIG_COLLECTION);
    const mappingCollection = database.collection(MAPPING_COLLECTION);
    const configs = (await configCollection.find({}).toArray()) as LegacySynonymConfigRecord[];
    stats.configsScanned = configs.length;

    const configGroups = new Map<string, LegacySynonymConfigRecord[]>();
    for (const config of configs) {
      const key = `${String(config.teamId)}:${String(config.datasetId)}`;
      const group = configGroups.get(key) ?? [];
      group.push(config);
      configGroups.set(key, group);
    }

    for (const group of configGroups.values()) {
      const config = group[0]!;
      const issueContext = {
        teamId: String(config.teamId),
        datasetId: String(config.datasetId),
        configId: String(config._id)
      };
      if (group.length !== 1) {
        stats.duplicateConfigs += 1;
        issues.push({ ...issueContext, reason: `存在 ${group.length} 条重复 config` });
        continue;
      }
      const configId = toObjectId(config._id);
      const configTeamId = toObjectId(config.teamId);
      const configDatasetId = toObjectId(config.datasetId);
      if (!configId || !configTeamId || !configDatasetId) {
        stats.failedDatasets += 1;
        issues.push({ ...issueContext, reason: 'config 缺少有效的 _id/teamId/datasetId' });
        continue;
      }
      if (isDatasetSynonymConfigMigrated(config)) {
        const version = typeof config.version === 'number' ? config.version : undefined;
        const enabled = typeof config.enabled === 'boolean' ? config.enabled : undefined;
        if (version === undefined || version < 1 || enabled === undefined) {
          stats.failedDatasets += 1;
          issues.push({ ...issueContext, reason: 'schemaVersion=2 但 version/enabled 无效' });
          continue;
        }
        const activeMappings = (await mappingCollection
          .find({
            teamId: config.teamId,
            datasetId: config.datasetId,
            fileVersion: version
          })
          .toArray()) as LegacySynonymMappingRecord[];
        stats.mappingsScanned += activeMappings.length;
        const invalidActiveSnapshot =
          (enabled && activeMappings.length === 0) ||
          activeMappings.some(
            (mapping) =>
              !toObjectId(mapping.logicalMappingId) ||
              typeof mapping.normalizedStandardizedTerm !== 'string' ||
              !Array.isArray(mapping.normalizedSynonymTerms) ||
              typeof mapping.fingerprint !== 'string'
          );
        if (invalidActiveSnapshot) {
          stats.failedDatasets += 1;
          issues.push({ ...issueContext, reason: 'schemaVersion=2 但 active mapping 快照不完整' });
          continue;
        }
        stats.alreadyMigrated += 1;
        continue;
      }

      const mappings = (await mappingCollection
        .find({ teamId: config.teamId, datasetId: config.datasetId })
        .toArray()) as LegacySynonymMappingRecord[];
      stats.mappingsScanned += mappings.length;
      const plan = prepareLegacySynonymMigration({ config, mappings });
      if (plan.kind === 'invalid') {
        stats.conflictDatasets += 1;
        issues.push({ ...issueContext, reason: plan.reason });
        continue;
      }

      stats.datasetsReady += 1;
      const mappingUpdateCount = plan.kind === 'ready' ? plan.mappings.length : 0;
      if (dryRun) {
        stats.datasetsWouldMigrate += 1;
        stats.mappingsWouldUpdate += mappingUpdateCount;
        continue;
      }

      try {
        if (plan.kind === 'ready') {
          await migratePreparedMappings({ collection: mappingCollection, plan, batchSize });
          const migratedMappings = (await mappingCollection
            .find(
              {
                teamId: config.teamId,
                datasetId: config.datasetId,
                fileVersion: LEGACY_VERSION
              },
              {
                projection: {
                  _id: 1,
                  logicalMappingId: 1,
                  standardizedTerm: 1,
                  normalizedStandardizedTerm: 1,
                  synonymTerms: 1,
                  normalizedSynonymTerms: 1,
                  fingerprint: 1
                }
              }
            )
            .toArray()) as PreparedLegacyMapping[];
          if (
            migratedMappings.length !== plan.mappings.length ||
            hashPreparedLegacyMappings(migratedMappings) !== plan.contentHash
          ) {
            throw new Error('mapping count/hash 校验失败，config 未切换');
          }
        }

        await configCollection.updateOne(
          { _id: configId, schemaVersion: { $ne: DatasetSynonymSchemaVersion } },
          {
            $set: {
              schemaVersion: DatasetSynonymSchemaVersion,
              version: LEGACY_VERSION,
              enabled: plan.kind === 'ready',
              updateTime: new Date()
            },
            $unset: {
              pendingVersion: '',
              pendingFileId: '',
              pendingFileName: '',
              pendingSize: '',
              pendingUploaderId: '',
              pendingUploadTime: ''
            }
          }
        );
        stats.datasetsMigrated += 1;
        stats.mappingsUpdated += mappingUpdateCount;
        if (plan.kind === 'empty') stats.emptyConfigsMigrated += 1;
      } catch (error) {
        stats.failedDatasets += 1;
        issues.push({
          ...issueContext,
          reason: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const configKeys = new Set(configGroups.keys());
    const mappingGroups = await mappingCollection
      .aggregate<{
        _id: { teamId: unknown; datasetId: unknown };
      }>([{ $group: { _id: { teamId: '$teamId', datasetId: '$datasetId' } } }])
      .toArray();
    for (const group of mappingGroups) {
      const key = `${String(group._id.teamId)}:${String(group._id.datasetId)}`;
      if (!configKeys.has(key)) {
        stats.orphanMappingGroups += 1;
        issues.push({
          teamId: String(group._id.teamId),
          datasetId: String(group._id.datasetId),
          reason: '存在 mapping 但没有对应 config，未自动激活'
        });
      }
    }

    console.log(
      JSON.stringify(
        {
          mode: dryRun ? 'dry-run' : 'execute',
          schemaVersion: DatasetSynonymSchemaVersion,
          collections: { config: CONFIG_COLLECTION, mapping: MAPPING_COLLECTION },
          stats,
          issues
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
  const main = async () => run(parseOptions(process.argv.slice(2)));
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

/*
MONGODB_URI='<uri>' pnpm --filter @fastgpt/app migrate:dataset-synonym-mongo-only -- --dry-run

MONGODB_URI='<uri>' pnpm --filter @fastgpt/app migrate:dataset-synonym-mongo-only -- --execute
*/
