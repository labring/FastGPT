import { type AppSchemaType } from '@fastgpt/global/core/app/type';
import { MongoAppVersion } from './schema';
import { Types } from '../../../common/mongo';
import { normalizeWorkflowConfig } from '@fastgpt/global/core/workflow/utils';
import { decodeToolSetNodesFromStorage } from '../jsonSchemaStorage';
import { extractAppResources } from '../resources';

export const getAppLatestVersion = async (appId: string, app?: AppSchemaType) => {
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
    const normalizedWorkflow = normalizeWorkflowConfig({
      nodes: decodeToolSetNodesFromStorage(version.nodes),
      edges: version.edges,
      chatConfig: version.chatConfig
    });
    return {
      versionId: String(version._id),
      versionName: version.versionName,
      resources: version.resources ?? [],
      ...normalizedWorkflow
    };
  }
  const normalizedWorkflow = normalizeWorkflowConfig({
    nodes: decodeToolSetNodesFromStorage(app?.modules ?? []),
    edges: app?.edges ?? [],
    chatConfig: app?.chatConfig
  });
  return {
    versionId: app?.pluginData?.nodeVersion,
    versionName: app?.name,
    // 历史 App 没有正式 Version 时，工作副本才是实际运行配置；不能复用可能被普通保存留旧的缓存。
    resources: extractAppResources({
      nodes: normalizedWorkflow.nodes,
      chatConfig: normalizedWorkflow.chatConfig
    }),
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
      const normalizedWorkflow = normalizeWorkflowConfig({
        nodes: decodeToolSetNodesFromStorage(version.nodes),
        edges: version.edges,
        chatConfig: version.chatConfig
      });
      return {
        versionId: String(version._id),
        versionName: version.versionName,
        resources: version.resources ?? [],
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
