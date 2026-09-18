import { AppFolderTypeList, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AppResourcesSchema } from '@fastgpt/global/core/app/type';
import { migrateWorkflowToCurrent } from '@fastgpt/global/core/workflow/migration';
import { Types } from '@fastgpt/service/common/mongo';
import {
  MongoTransactionConflictError,
  mongoSessionRun
} from '@fastgpt/service/common/mongo/sessionRun';
import {
  decodeToolSetNodesFromStorage,
  encodeMcpToolSetNodesForStorage
} from '@fastgpt/service/core/app/jsonSchemaStorage';
import { resolveStoredAppResources } from '@fastgpt/service/core/app/resources';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { filterAuthorizedAppResources } from '@fastgpt/service/support/permission/app/resource';
import { getModelHandle } from '@fastgpt/service/core/ai/model';
import type { SystemModelDataType } from '@fastgpt/global/core/ai/model.schema';
import { parseLegacyMcpChildApps } from '@fastgpt/service/core/app/mcp';
import { getMCPToolSetRuntimeNode } from '@fastgpt/global/core/app/tool/mcpTool/utils';

type LegacyResourceRefs = {
  skillIds?: unknown;
};

export type AppResourceMigrationRecord = {
  _id: unknown;
  nodes?: unknown;
  modules?: unknown;
  edges?: unknown;
  chatConfig?: unknown;
  resources?: unknown;
  resourceRefs?: LegacyResourceRefs;
  type?: unknown;
  tmbId?: unknown;
  name?: unknown;
  avatar?: unknown;
  parentId?: unknown;
  teamId?: unknown;
  publishedVersionId?: unknown;
};

export type AppResourceMigrationFailure = {
  record: AppResourceMigrationRecord;
  message: string;
};

export type AppResourceMigrationBatchResult = {
  failures: AppResourceMigrationFailure[];
  updatedCount: number;
  createdVersionCount: number;
};

type AppVersionState = {
  latestPublishedVersionId?: unknown;
  pointerIsValid: boolean;
};

const emptyBatchResult = (): AppResourceMigrationBatchResult => ({
  failures: [],
  updatedCount: 0,
  createdVersionCount: 0
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

const getWorkflowSnapshot = (record: AppResourceMigrationRecord, isVersion: boolean) => {
  const snapshot: Record<string, unknown> = {
    edges: getSnapshotQueryValue(record.edges),
    chatConfig: getSnapshotQueryValue(record.chatConfig),
    'resourceRefs.skillIds': getSnapshotQueryValue(record.resourceRefs?.skillIds)
  };
  snapshot[isVersion ? 'nodes' : 'modules'] = getSnapshotQueryValue(
    isVersion ? record.nodes : record.modules
  );
  return snapshot;
};

const isFolderApp = (type: unknown) =>
  typeof type === 'string' &&
  AppFolderTypeList.includes(type as (typeof AppFolderTypeList)[number]);

/** 从历史工作流字段确定性生成资源快照。 */
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
    resources: record.resources,
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

/** 固定集合当前 ObjectId 上界和数量，避免滚动升级期间持续写入使主扫描无法结束。 */
export const initializeAppResourceSnapshot = async (
  collection: typeof MongoApp.collection | typeof MongoAppVersion.collection
) => {
  const lastRecord = await collection
    .find({ _id: { $type: 'objectId' } }, { projection: { _id: 1 } })
    .sort({ _id: -1 })
    .limit(1)
    .next();
  const endId = toObjectId(lastRecord?._id);
  const total = endId
    ? await collection.countDocuments({
        _id: { $type: 'objectId', $lte: endId }
      })
    : 0;

  return { endId: endId ? String(endId) : null, total };
};

const readObjectIdBatch = <RecordType extends AppResourceMigrationRecord>({
  collection,
  endId,
  lastId,
  limit,
  projection
}: {
  collection: typeof MongoApp.collection | typeof MongoAppVersion.collection;
  endId?: string | null;
  lastId: string | null;
  limit: number;
  projection: Record<string, 1>;
}) => {
  const idRange: { $gt?: Types.ObjectId; $lte?: Types.ObjectId } = {};
  if (lastId) idRange.$gt = new Types.ObjectId(lastId);
  if (endId) idRange.$lte = new Types.ObjectId(endId);

  return collection
    .find({ _id: { $type: 'objectId', ...idRange } }, { projection })
    .sort({ _id: 1 })
    .limit(limit)
    .toArray() as Promise<RecordType[]>;
};

/** 按不可变 `_id` 游标读取 Version 当前批次。 */
export const readAppVersionResourceBatch = (params: {
  endId?: string | null;
  lastId: string | null;
  limit: number;
}) =>
  readObjectIdBatch<AppResourceMigrationRecord>({
    collection: MongoAppVersion.collection,
    ...params,
    projection: {
      _id: 1,
      tmbId: 1,
      nodes: 1,
      edges: 1,
      chatConfig: 1,
      resources: 1,
      'resourceRefs.skillIds': 1
    }
  });

/** 按不可变 `_id` 游标读取 App 当前批次。 */
export const readAppResourceBatch = (params: {
  endId?: string | null;
  lastId: string | null;
  limit: number;
}) =>
  readObjectIdBatch<AppResourceMigrationRecord>({
    collection: MongoApp.collection,
    ...params,
    projection: {
      _id: 1,
      modules: 1,
      edges: 1,
      chatConfig: 1,
      'resourceRefs.skillIds': 1,
      publishedVersionId: 1,
      type: 1,
      tmbId: 1,
      name: 1,
      avatar: 1,
      parentId: 1,
      teamId: 1
    }
  });

/** 按失败记录中的 ID 重新读取 Version，记录已删除时返回空。 */
export const readAppVersionResourceRecord = (id: string) =>
  MongoAppVersion.collection.findOne(
    { _id: (toObjectId(id) ?? id) as never },
    {
      projection: {
        _id: 1,
        tmbId: 1,
        nodes: 1,
        edges: 1,
        chatConfig: 1,
        resources: 1,
        'resourceRefs.skillIds': 1
      }
    }
  ) as Promise<AppResourceMigrationRecord | null>;

/** 按失败记录中的 ID 重新读取 App，记录已删除时返回空。 */
export const readAppResourceRecord = (id: string) =>
  MongoApp.collection.findOne(
    { _id: (toObjectId(id) ?? id) as never },
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
        name: 1,
        avatar: 1,
        parentId: 1,
        teamId: 1
      }
    }
  ) as Promise<AppResourceMigrationRecord | null>;

/**
 * 使用工作流读取快照作为 compare-and-set 条件回填 Version.resources。
 * 已有合法快照保持不变；并发写已产出合法快照也视为该记录完成。
 */
export const backfillAppVersionResourceRecords = async (
  records: AppResourceMigrationRecord[]
): Promise<AppResourceMigrationBatchResult> => {
  const result = emptyBatchResult();

  for (const record of records) {
    if (Array.isArray(record.resources) && AppResourcesSchema.safeParse(record.resources).success) {
      continue;
    }

    try {
      const snapshot = buildAppResourceSnapshot(record, (await getModelHandle()).getAllModels());
      const authorizedResources = await filterAuthorizedAppResources({
        resources: snapshot.resources,
        tmbId: record.tmbId
      });
      const updateResult = await MongoAppVersion.collection.updateOne(
        {
          _id: record._id as never,
          resources: getSnapshotQueryValue(record.resources),
          ...getWorkflowSnapshot(record, true)
        },
        { $set: { resources: authorizedResources } }
      );
      if (updateResult.matchedCount === 1) {
        result.updatedCount += 1;
        continue;
      }

      const current = await MongoAppVersion.collection.findOne(
        { _id: record._id as never },
        { projection: { resources: 1 } }
      );
      if (!current) continue;
      const currentParsed = AppResourcesSchema.safeParse(current.resources);
      if (currentParsed.success) continue;
      if (current.resources !== undefined) {
        result.failures.push({
          record,
          message: currentParsed.error.message
        });
        continue;
      }
      result.failures.push({
        record,
        message: 'App Version changed concurrently before its resources could be backfilled'
      });
    } catch (error) {
      result.failures.push({
        record,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return result;
};

const readAppVersionStates = async (records: AppResourceMigrationRecord[]) => {
  const appIds = records.map((record) => record._id).filter((id) => id !== undefined);
  const pointerIds = records
    .map((record) => toObjectId(record.publishedVersionId))
    .filter((id): id is Types.ObjectId => Boolean(id));
  const [latestPublishedVersions, pointerVersions] = await Promise.all([
    MongoAppVersion.collection
      .aggregate<{ _id: unknown; latestPublishedVersionId: unknown }>([
        { $match: { appId: { $in: appIds }, isPublish: true } },
        { $sort: { time: -1, _id: -1 } },
        {
          $group: {
            _id: '$appId',
            latestPublishedVersionId: { $first: '$_id' }
          }
        }
      ])
      .toArray(),
    pointerIds.length === 0
      ? []
      : MongoAppVersion.collection
          .find({ _id: { $in: pointerIds } }, { projection: { _id: 1, appId: 1 } })
          .toArray()
  ]);
  const latestPublishedVersionByAppId = new Map(
    latestPublishedVersions.map((version) => [
      String(version._id),
      version.latestPublishedVersionId
    ])
  );
  const pointerOwnerById = new Map(
    pointerVersions.map((version) => [String(version._id), String(version.appId)])
  );

  return new Map(
    records.map((record) => {
      const appId = String(record._id);
      const pointerId =
        record.publishedVersionId == null ? undefined : String(record.publishedVersionId);
      return [
        appId,
        {
          latestPublishedVersionId: latestPublishedVersionByAppId.get(appId),
          pointerIsValid: Boolean(pointerId && pointerOwnerById.get(pointerId) === appId)
        } satisfies AppVersionState
      ];
    })
  );
};

const updatePublishedVersionPointer = async ({
  record,
  publishedVersionId
}: {
  record: AppResourceMigrationRecord;
  publishedVersionId: unknown;
}) => {
  const result = await MongoApp.collection.updateOne(
    {
      _id: record._id as never,
      publishedVersionId: getSnapshotQueryValue(record.publishedVersionId)
    },
    { $set: { publishedVersionId } }
  );
  if (result.matchedCount === 1) return true;

  const current = await MongoApp.collection.findOne(
    { _id: record._id as never },
    { projection: { publishedVersionId: 1 } }
  );
  if (!current?.publishedVersionId) return !current;
  const currentVersion = await MongoAppVersion.collection.findOne(
    { _id: current.publishedVersionId, appId: record._id as never },
    { projection: { _id: 1 } }
  );
  return Boolean(currentVersion);
};

/**
 * 对无正式 Version App，在同一事务内重读权威 App 图、创建正式 Version 并写入指针。
 * 事务回滚覆盖写入后退出，事务内的“仍无正式 Version”检查使整个最小单元可重放。
 */
const createMissingPublishedVersion = async (record: AppResourceMigrationRecord) => {
  const models = (await getModelHandle()).getAllModels();
  return mongoSessionRun(async (session) => {
    const currentApp = (await MongoApp.collection.findOne(
      { _id: record._id as never },
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
          name: 1,
          avatar: 1,
          parentId: 1,
          teamId: 1
        },
        session
      }
    )) as AppResourceMigrationRecord | null;
    if (!currentApp || isFolderApp(currentApp.type) || Boolean(currentApp.parentId))
      return { appUpdated: false, versionCreated: false };
    if (currentApp.tmbId === undefined) throw new Error('App has no tmbId');

    const existingPublishedVersion = await MongoAppVersion.collection.findOne(
      { appId: currentApp._id as never, isPublish: true },
      { projection: { _id: 1 }, session }
    );
    if (existingPublishedVersion) {
      throw new MongoTransactionConflictError(
        new Error('App gained a published Version while the migration was creating one')
      );
    }

    const workflowSnapshot = getWorkflowSnapshot(currentApp, false);

    let mcpModulesOverride: unknown[] | undefined;
    if (currentApp.type === AppTypeEnum.mcpToolSet) {
      const hasInlineToolSet = !!(
        Array.isArray(currentApp.modules) && (currentApp.modules[0] as any)?.toolConfig?.mcpToolSet
      );
      if (!hasInlineToolSet) {
        const legacyChildren = await MongoApp.collection
          .find(
            { parentId: currentApp._id as never },
            { projection: { name: 1, intro: 1, modules: 1 }, session }
          )
          .toArray();

        const { url, headerSecret, toolList } = parseLegacyMcpChildApps(legacyChildren as any);
        if (toolList.length > 0) {
          const runtimeNode = getMCPToolSetRuntimeNode({
            url: url || '',
            toolList,
            headerSecret,
            name: typeof currentApp.name === 'string' ? currentApp.name : undefined,
            avatar: typeof currentApp.avatar === 'string' ? currentApp.avatar : undefined
          });
          mcpModulesOverride = [runtimeNode];
        }
      }
    }

    const snapshot = buildAppResourceSnapshot(
      mcpModulesOverride ? { ...currentApp, modules: mcpModulesOverride } : currentApp,
      models
    );
    const authorizedResources = await filterAuthorizedAppResources({
      resources: snapshot.resources,
      tmbId: currentApp.tmbId
    });
    const insertResult = await MongoAppVersion.collection.insertOne(
      {
        tmbId: String(currentApp.tmbId),
        appId: currentApp._id as never,
        time: new Date(),
        nodes: encodeMcpToolSetNodesForStorage(snapshot.normalizedWorkflow.nodes),
        edges: snapshot.normalizedWorkflow.edges,
        chatConfig: snapshot.normalizedWorkflow.chatConfig,
        isPublish: true,
        versionName: typeof currentApp.name === 'string' ? currentApp.name : undefined,
        resources: authorizedResources
      },
      { session }
    );
    const updateResult = await MongoApp.collection.updateOne(
      {
        _id: currentApp._id as never,
        publishedVersionId: getSnapshotQueryValue(currentApp.publishedVersionId),
        ...workflowSnapshot
      },
      { $set: { publishedVersionId: insertResult.insertedId } },
      { session }
    );
    if (updateResult.matchedCount !== 1) {
      throw new MongoTransactionConflictError(
        new Error('App changed while the migration was creating its first Version')
      );
    }

    return {
      appUpdated: true,
      versionCreated: true
    };
  });
};

/** 回填 App 正式指针，并为无正式 Version 的非文件夹 App 原子补建正式 Version。 */
export const backfillAppResourceRecords = async (
  records: AppResourceMigrationRecord[]
): Promise<AppResourceMigrationBatchResult> => {
  const result = emptyBatchResult();
  const states = await readAppVersionStates(records);

  for (const record of records) {
    if (record.parentId) continue;
    const state = states.get(String(record._id));
    if (!state) continue;

    try {
      if (state.latestPublishedVersionId) {
        if (state.pointerIsValid) continue;
        const updated = await updatePublishedVersionPointer({
          record,
          publishedVersionId: state.latestPublishedVersionId
        });
        if (updated) result.updatedCount += 1;
        else {
          result.failures.push({
            record,
            message: 'App changed concurrently before its published Version pointer was backfilled'
          });
        }
        continue;
      }
      if (isFolderApp(record.type)) continue;

      const created = await createMissingPublishedVersion(record);
      if (created?.appUpdated) result.updatedCount += 1;
      if (created?.versionCreated) result.createdVersionCount += 1;
    } catch (error) {
      result.failures.push({
        record,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return result;
};

/** 扫描 Version 快照的真实完成条件，并返回需要管理员处理的记录。 */
export const validateAppVersionResourceRecords = (records: AppResourceMigrationRecord[]) =>
  records.flatMap<AppResourceMigrationFailure>((record) => {
    const parsed = AppResourcesSchema.safeParse(record.resources);
    return parsed.success ? [] : [{ record, message: parsed.error.message }];
  });

/** 扫描 App 正式指针与无正式 Version 补建的真实完成条件。 */
export const validateAppResourceRecords = async (records: AppResourceMigrationRecord[]) => {
  const states = await readAppVersionStates(records);
  return records.flatMap<AppResourceMigrationFailure>((record) => {
    if (record.parentId) return [];
    const state = states.get(String(record._id));
    if (!state) return [{ record, message: 'Unable to inspect App Version state' }];
    if (state.latestPublishedVersionId && !state.pointerIsValid) {
      return [{ record, message: 'App published Version pointer is still missing or invalid' }];
    }
    if (!isFolderApp(record.type) && !state.latestPublishedVersionId) {
      return [{ record, message: 'App still has no published Version' }];
    }
    return [];
  });
};

/** 非 ObjectId 记录无法进入稳定游标，最终校验时单独报告。 */
export const readInvalidAppResourceRecordIds = async (
  collection: typeof MongoApp.collection | typeof MongoAppVersion.collection,
  limit: number,
  lastId?: unknown
) =>
  collection
    .find(
      {
        _id: {
          $not: { $type: 'objectId' },
          ...(lastId === undefined ? {} : { $gt: lastId })
        }
      } as never,
      { projection: { _id: 1 } }
    )
    .sort({ _id: 1 })
    .limit(limit)
    .toArray() as Promise<AppResourceMigrationRecord[]>;
