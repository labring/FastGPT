import { AppSchema } from '@fastgpt/global/core/app/type';
import { MongoAppVersion } from './schema';

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
  const version = await MongoAppVersion.findOne({
    _id: versionId,
    appId
  }).lean();

  if (version && versionId) {
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
