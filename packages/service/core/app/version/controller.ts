import {
  AppResourcesSchema,
  type AppResourcesType,
  type AppSchemaType
} from '@fastgpt/global/core/app/type';
import { MongoApp } from '../schema';
import { MongoAppVersion } from './schema';
import { Types, type ClientSession } from '../../../common/mongo';
import { migrateWorkflowToCurrent } from '@fastgpt/global/core/workflow/migration';
import { decodeToolSetNodesFromStorage } from '../jsonSchemaStorage';
import { resolveStoredAppResources } from '../resources';
import type { AppVersionSchemaType } from '@fastgpt/global/core/app/version/type';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { MongoTransactionConflictError } from '../../../common/mongo/sessionRun';

type VersionResourceSource = Pick<AppVersionSchemaType, 'nodes' | 'chatConfig' | 'resources'> & {
  resourceRefs?: unknown;
};
type NormalizedWorkflow = ReturnType<typeof migrateWorkflowToCurrent>;
export type AppVersionWorkflow = NormalizedWorkflow & {
  versionId?: string;
  versionName?: string;
  resources: AppResourcesType;
};
export type AppPublishedWorkflow = Pick<AppVersionSchemaType, 'nodes'>;

const getVersionResourceSnapshot = (
  version: VersionResourceSource,
  nodes = version.nodes,
  chatConfig = version.chatConfig
): AppResourcesType =>
  resolveStoredAppResources({
    resources: version.resources,
    nodes,
    chatConfig,
    resourceRefs: version.resourceRefs
  });

const normalizeAppVersionWorkflow = (version: AppVersionSchemaType): AppVersionWorkflow => {
  // 历史版本只迁移该版本自身的系统配置节点，不继承当前应用 chatConfig，
  // 避免当前配置占位导致该版本中的欢迎语、定时任务等旧值被丢弃。
  const normalizedWorkflow = migrateWorkflowToCurrent({
    nodes: decodeToolSetNodesFromStorage(version.nodes),
    edges: version.edges,
    chatConfig: version.chatConfig
  });
  return {
    versionId: String(version._id),
    versionName: version.versionName,
    resources: getVersionResourceSnapshot(
      version,
      normalizedWorkflow.nodes,
      normalizedWorkflow.chatConfig
    ),
    ...normalizedWorkflow
  };
};

const emptyVersionWorkflow = (): AppVersionWorkflow => {
  const normalizedWorkflow = migrateWorkflowToCurrent({
    nodes: [],
    edges: [],
    chatConfig: undefined
  });
  return {
    versionId: undefined,
    versionName: undefined,
    resources: [] as AppResourcesType,
    ...normalizedWorkflow
  };
};

export type AppVersionLookupApp = AppSchemaType;

const loadApp = async (appId: string, app?: AppVersionLookupApp) =>
  app ?? ((await MongoApp.findById(appId).lean()) as AppSchemaType | null | undefined);

/**
 * 读取当前正式工作流：优先 publishedVersionId，否则最新 isPublish Version。
 * 找不到 Version 时返回空图，不再读 App.modules。
 */
export const getAppLatestVersion = async (appId: string, app?: AppVersionLookupApp) => {
  const migrationApp = await loadApp(appId, app);
  const publishedVersion =
    migrationApp?.publishedVersionId &&
    Types.ObjectId.isValid(String(migrationApp.publishedVersionId))
      ? await MongoAppVersion.findOne({
          _id: migrationApp.publishedVersionId,
          appId
        }).lean()
      : null;
  const version =
    publishedVersion ??
    (await MongoAppVersion.findOne({
      appId,
      isPublish: true
    })
      .sort({
        time: -1,
        _id: -1
      })
      .lean());

  if (version) return normalizeAppVersionWorkflow(version);
  return emptyVersionWorkflow();
};

/**
 * 读取编辑器工作副本：始终取该 App 最新写入的 Version，包含自动保存记录。
 * 找不到 Version 时返回空图，不再读 App.modules。
 */
export const getAppDraftWorkflow = async (appId: string) => {
  const draft = await getAppDraftVersion(appId);
  if (draft) return normalizeAppVersionWorkflow(draft);
  return emptyVersionWorkflow();
};

/**
 * 读取当前最新 Version，作为保存增量鉴权的 baseline。
 */
export const getAppDraftVersion = async (appId: string, session?: ClientSession) => {
  const query = MongoAppVersion.findOne({ appId }).sort({ time: -1, _id: -1 });
  if (session) query.session(session);
  return query.lean();
};

/**
 * 读取当前草稿 Version 的资源快照，供保存增量鉴权做 baseline。
 * 没有草稿时返回空数组，本次提取全部视为新增。传入 session 时，读取会参与同一事务，
 * 事务重试后也会重新读取最新的草稿 Version。
 */
export const getAppDraftResourceBaseline = async (appId: string, session?: ClientSession) => {
  const draft = await getAppDraftVersion(appId, session);
  if (!draft) return [];

  // 非法快照不能回退为当前节点提取，否则曾被保存过滤掉的资源会重新变成 baseline，
  // 从而绕过下一次保存/发布的新增资源鉴权。缺失字段仍按历史版本兼容逻辑提取。
  if (Array.isArray(draft.resources) && !AppResourcesSchema.safeParse(draft.resources).success) {
    return [];
  }

  return resolveStoredAppResources({
    resources: draft.resources,
    nodes: decodeToolSetNodesFromStorage(draft.nodes),
    chatConfig: draft.chatConfig,
    resourceRefs: (draft as { resourceRefs?: unknown }).resourceRefs
  });
};

/**
 * 在同一事务内更新当前正式 Version，并用 App 正式版本指针做 CAS。
 * ToolSet 没有独立草稿生命周期；无有效指针时只回退到最新正式版本，并在成功后补齐指针。
 * 并发发布改变指针时更新条件不再命中，交给事务入口重试，避免把工具配置写入旧版本。
 */
export const updateAppPublishedVersion = async ({
  appId,
  nodes,
  resources,
  session
}: {
  appId: string;
  nodes: AppVersionSchemaType['nodes'];
  resources: AppResourcesType;
  session: ClientSession;
}) => {
  const app = await MongoApp.findById(appId, 'publishedVersionId').session(session).lean();
  if (!app) throw AppErrEnum.unExist;

  const pointerVersion =
    app.publishedVersionId && Types.ObjectId.isValid(String(app.publishedVersionId))
      ? await MongoAppVersion.findOne(
          {
            _id: app.publishedVersionId,
            appId
          },
          '_id'
        )
          .session(session)
          .lean()
      : null;
  const version =
    pointerVersion ??
    (await MongoAppVersion.findOne(
      {
        appId,
        isPublish: true
      },
      '_id'
    )
      .sort({ time: -1, _id: -1 })
      .session(session)
      .lean());

  if (!version) throw AppErrEnum.unExist;

  const versionUpdateResult = await MongoAppVersion.updateOne(
    {
      _id: version._id,
      appId
    },
    {
      $set: {
        nodes,
        resources
      }
    },
    { session }
  );
  if (versionUpdateResult.matchedCount !== 1) {
    throw new MongoTransactionConflictError(
      new Error('Published app version changed during tool set update')
    );
  }

  const expectedPublishedVersionId =
    app.publishedVersionId && Types.ObjectId.isValid(String(app.publishedVersionId))
      ? app.publishedVersionId
      : undefined;
  const appFilter = expectedPublishedVersionId
    ? {
        _id: appId,
        publishedVersionId: expectedPublishedVersionId
      }
    : {
        _id: appId,
        $or: [{ publishedVersionId: null }, { publishedVersionId: { $exists: false } }]
      };
  const shouldRepairPublishedVersion = !pointerVersion;
  const appUpdateResult = await MongoApp.updateOne(
    appFilter,
    {
      $set: {
        updateTime: new Date(),
        ...(shouldRepairPublishedVersion ? { publishedVersionId: version._id } : {})
      }
    },
    { session }
  );
  if (appUpdateResult.matchedCount !== 1) {
    throw new MongoTransactionConflictError(
      new Error('Published app version pointer changed during tool set update')
    );
  }

  return version._id;
};

/** 批量读取 App 当前正式 Version，供运行时入口复用同一份版本选择逻辑。 */
export const getAppPublishedWorkflowMap = async (
  apps: AppSchemaType[]
): Promise<Map<string, AppPublishedWorkflow>> => {
  if (apps.length === 0) return new Map<string, AppPublishedWorkflow>();

  const pointerIds = apps
    .map((app) => app.publishedVersionId)
    .filter((id): id is NonNullable<typeof id> => !!id && Types.ObjectId.isValid(String(id)));

  const versionById = new Map<string, AppVersionSchemaType>();
  const versionByAppId = new Map<string, AppVersionSchemaType>();

  if (pointerIds.length > 0) {
    const versions = await MongoAppVersion.find({ _id: { $in: pointerIds } }).lean();
    versions.forEach((version) => versionById.set(String(version._id), version));
  }

  const isPointerVersionForApp = (
    app: AppSchemaType,
    version?: AppVersionSchemaType
  ): version is AppVersionSchemaType => !!version && String(version.appId) === String(app._id);

  const appsNeedingLatestPublish = apps
    .filter((app) => {
      if (!app.publishedVersionId || !Types.ObjectId.isValid(String(app.publishedVersionId))) {
        return true;
      }
      return !isPointerVersionForApp(app, versionById.get(String(app.publishedVersionId)));
    })
    .map((app) => app._id);

  if (appsNeedingLatestPublish.length > 0) {
    const latestPublished = await MongoAppVersion.aggregate<{
      _id: unknown;
      doc: AppVersionSchemaType;
    }>([
      {
        $match: {
          appId: { $in: appsNeedingLatestPublish },
          isPublish: true
        }
      },
      { $sort: { time: -1, _id: -1 } },
      {
        $group: {
          _id: '$appId',
          doc: { $first: '$$ROOT' }
        }
      }
    ]);
    latestPublished.forEach((item) => versionByAppId.set(String(item._id), item.doc));
  }

  return new Map(
    apps.map((app) => {
      const pointerVersion = app.publishedVersionId
        ? versionById.get(String(app.publishedVersionId))
        : undefined;
      const version = isPointerVersionForApp(app, pointerVersion)
        ? pointerVersion
        : versionByAppId.get(String(app._id));
      return [String(app._id), { nodes: decodeToolSetNodesFromStorage(version?.nodes ?? []) }];
    })
  );
};

export const getAppVersionById = async ({
  appId,
  versionId,
  app
}: {
  appId: string;
  versionId?: string;
  app?: AppVersionLookupApp;
}) => {
  if (versionId && Types.ObjectId.isValid(versionId)) {
    const version = await MongoAppVersion.findOne({
      _id: versionId,
      appId
    }).lean();

    if (version) return normalizeAppVersionWorkflow(version);
  }

  return getAppLatestVersion(appId, app);
};

export const checkIsLatestVersion = async ({
  appId,
  versionId
}: {
  appId: string;
  versionId: string;
}) => {
  if (!Types.ObjectId.isValid(versionId)) {
    return false;
  }
  const version = await MongoAppVersion.findOne(
    {
      appId,
      isPublish: true,
      _id: { $gt: versionId }
    },
    '_id'
  ).lean();

  return !version;
};
