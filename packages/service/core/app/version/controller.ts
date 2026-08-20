import { type AppResourcesType, type AppSchemaType } from '@fastgpt/global/core/app/type';
import { MongoApp } from '../schema';
import { MongoAppVersion } from './schema';
import { Types } from '../../../common/mongo';
import { migrateWorkflowToCurrent } from '@fastgpt/global/core/workflow/migration';
import { decodeToolSetNodesFromStorage } from '../jsonSchemaStorage';
import { resolveStoredAppResources } from '../resources';
import type { AppVersionSchemaType } from '@fastgpt/global/core/app/version/type';

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
        time: -1
      })
      .lean());

  if (version) return normalizeAppVersionWorkflow(version);
  return emptyVersionWorkflow();
};

/**
 * 读取编辑器草稿工作流：优先 draftVersionId，否则该 App time 最新 Version。
 * 找不到 Version 时返回空图，不再读 App.modules。
 */
export const getAppDraftWorkflow = async (appId: string, app?: AppVersionLookupApp) => {
  const currentApp = await loadApp(appId, app);
  const draft = await getAppDraftVersion(appId, currentApp ?? undefined);
  if (draft) return normalizeAppVersionWorkflow(draft);
  return emptyVersionWorkflow();
};

/**
 * 读取当前编辑器草稿 Version，作为保存增量鉴权的 baseline。
 * 优先 draftVersionId；没有指针则取该 App time 最新的 Version。
 */
export const getAppDraftVersion = async (appId: string, app?: AppVersionLookupApp) => {
  const currentApp = await loadApp(appId, app);
  if (currentApp?.draftVersionId && Types.ObjectId.isValid(String(currentApp.draftVersionId))) {
    const draft = await MongoAppVersion.findOne({
      _id: currentApp.draftVersionId,
      appId
    }).lean();
    if (draft) return draft;
  }

  return MongoAppVersion.findOne({ appId }).sort({ time: -1 }).lean();
};

/**
 * 读取当前草稿 Version 的资源快照，供保存增量鉴权做 baseline。
 * 没有草稿时返回空数组，本次提取全部视为新增。
 */
export const getAppDraftResourceBaseline = async (appId: string, app?: AppVersionLookupApp) => {
  const draft = await getAppDraftVersion(appId, app);
  if (!draft) return [];
  return resolveStoredAppResources({
    resources: draft.resources,
    nodes: decodeToolSetNodesFromStorage(draft.nodes),
    chatConfig: draft.chatConfig,
    resourceRefs: (draft as { resourceRefs?: unknown }).resourceRefs
  });
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
      { $sort: { time: -1 } },
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
