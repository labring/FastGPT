import { type AppSchemaType } from '@fastgpt/global/core/app/type';
import { MongoApp } from '../schema';
import { MongoAppVersion } from './schema';
import { Types } from '../../../common/mongo';
import { migrateWorkflowToCurrent } from '@fastgpt/global/core/workflow/migration';
import { getWorkflowMigrationOptions } from '../tool/utils/client';

export const getAppLatestVersion = async (
  appId: string,
  app?: AppSchemaType,
  options?: { skipAgentToolMigration?: boolean }
) => {
  const migrationApp =
    options?.skipAgentToolMigration || app
      ? app
      : ((await MongoApp.findById(appId).lean()) as AppSchemaType | null | undefined);
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
    const normalizedWorkflow = await migrateWorkflowToCurrent(
      {
        nodes: version.nodes,
        edges: version.edges,
        chatConfig: version.chatConfig
      },
      options?.skipAgentToolMigration
        ? { migrateAgentTools: false }
        : getWorkflowMigrationOptions({ teamId: migrationApp?.teamId })
    );
    return {
      versionId: String(version._id),
      versionName: version.versionName,
      ...normalizedWorkflow
    };
  }
  const normalizedWorkflow = await migrateWorkflowToCurrent(
    {
      nodes: migrationApp?.modules ?? [],
      edges: migrationApp?.edges ?? [],
      chatConfig: migrationApp?.chatConfig
    },
    options?.skipAgentToolMigration
      ? { migrateAgentTools: false }
      : getWorkflowMigrationOptions({ teamId: migrationApp?.teamId })
  );
  return {
    versionId: migrationApp?.pluginData?.nodeVersion,
    versionName: migrationApp?.name,
    ...normalizedWorkflow
  };
};

export const getAppVersionById = async ({
  appId,
  versionId,
  app,
  skipAgentToolMigration
}: {
  appId: string;
  versionId?: string;
  app?: AppSchemaType;
  skipAgentToolMigration?: boolean;
}) => {
  // 检查 versionId 是否符合 ObjectId 格式
  if (versionId && Types.ObjectId.isValid(versionId)) {
    const version = await MongoAppVersion.findOne({
      _id: versionId,
      appId
    }).lean();

    if (version) {
      const migrationApp =
        skipAgentToolMigration || app
          ? app
          : ((await MongoApp.findById(appId).lean()) as AppSchemaType | null | undefined);
      const normalizedWorkflow = await migrateWorkflowToCurrent(
        {
          nodes: version.nodes,
          edges: version.edges,
          chatConfig: version.chatConfig
        },
        skipAgentToolMigration
          ? { migrateAgentTools: false }
          : getWorkflowMigrationOptions({ teamId: migrationApp?.teamId })
      );
      return {
        versionId: String(version._id),
        versionName: version.versionName,
        ...normalizedWorkflow
      };
    }
  }

  // If the version does not exist, the latest version is returned
  return getAppLatestVersion(appId, app, { skipAgentToolMigration });
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
