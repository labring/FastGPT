import { type AppSchemaType } from '@fastgpt/global/core/app/type';
import { MongoApp } from '../schema';
import { MongoAppVersion } from './schema';
import { Types } from '../../../common/mongo';
import { migrateWorkflowToCurrent } from '@fastgpt/global/core/workflow/migration';
import { decodeToolSetNodesFromStorage } from '../jsonSchemaStorage';

export const getAppLatestVersion = async (appId: string, app?: AppSchemaType) => {
  const migrationApp =
    app ?? ((await MongoApp.findById(appId).lean()) as AppSchemaType | null | undefined);
  const version = await MongoAppVersion.findOne({
    appId,
    isPublish: true
  })
    .sort({
      time: -1
    })
    .lean();

  if (version) {
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
      ...normalizedWorkflow
    };
  }
  const normalizedWorkflow = migrateWorkflowToCurrent({
    nodes: decodeToolSetNodesFromStorage(migrationApp?.modules ?? []),
    edges: migrationApp?.edges ?? [],
    chatConfig: migrationApp?.chatConfig
  });
  return {
    versionId: migrationApp?.pluginData?.nodeVersion,
    versionName: migrationApp?.name,
    ...normalizedWorkflow
  };
};

export const getAppVersionById = async ({
  appId,
  versionId,
  app
}: {
  appId: string;
  versionId?: string;
  app?: AppSchemaType;
}) => {
  // 检查 versionId 是否符合 ObjectId 格式
  if (versionId && Types.ObjectId.isValid(versionId)) {
    const version = await MongoAppVersion.findOne({
      _id: versionId,
      appId
    }).lean();

    if (version) {
      const normalizedWorkflow = migrateWorkflowToCurrent({
        nodes: decodeToolSetNodesFromStorage(version.nodes),
        edges: version.edges,
        chatConfig: version.chatConfig
      });
      return {
        versionId: String(version._id),
        versionName: version.versionName,
        ...normalizedWorkflow
      };
    }
  }

  // If the version does not exist, the latest version is returned
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
