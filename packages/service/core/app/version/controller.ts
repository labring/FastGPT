import { AppSchema } from '@fastgpt/global/core/app/type';
import { MongoAppVersion } from './schema';
import { Types } from '../../../common/mongo';

export const getAppLatestVersion = async (appId: string, app?: AppSchema) => {
  const version = await MongoAppVersion.findOne({
    appId,
    isPublish: true
  })
    .sort({
      time: -1
    })
    .lean();

  if (version) {
    return {
      versionId: version._id,
      nodes: version.nodes,
      edges: version.edges,
      chatConfig: version.chatConfig || app?.chatConfig || {}
    };
  }
  return {
    versionId: app?.pluginData?.nodeVersion,
    nodes: app?.modules || [],
    edges: app?.edges || [],
    chatConfig: app?.chatConfig || {}
  };
};

export const getAppVersionById = async ({
  appId,
  versionId,
  app
}: {
  appId: string;
  versionId?: string;
  app?: AppSchema;
}) => {
  // 检查 versionId 是否符合 ObjectId 格式
  if (versionId && Types.ObjectId.isValid(versionId)) {
    const version = await MongoAppVersion.findOne({
      _id: versionId,
      appId
    }).lean();

    if (version) {
      return {
        versionId: version._id,
        nodes: version.nodes,
        edges: version.edges,
        chatConfig: version.chatConfig || app?.chatConfig || {}
      };
    }
  }

  // If the version does not exist, the latest version is returned
  return getAppLatestVersion(appId, app);
};
