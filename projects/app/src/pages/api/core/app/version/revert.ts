import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { beforeUpdateAppFormat } from '@fastgpt/service/core/app/controller';
import { getNextTimeByCronStringAndTimezone } from '@fastgpt/global/common/string/time';
import { PostRevertAppProps } from '@/global/core/app/api';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

type Response = {};

async function handler(req: NextApiRequest, res: NextApiResponse<any>): Promise<{}> {
  const { appId } = req.query as { appId: string };
  const {
    editNodes = [],
    editEdges = [],
    editChatConfig,
    versionId
  } = req.body as PostRevertAppProps;

  const { app } = await authApp({ appId, req, per: WritePermissionVal, authToken: true });

  const version = await MongoAppVersion.findOne({
    _id: versionId,
    appId
  });

  if (!version) {
    throw new Error('version not found');
  }

  const { nodes: formatEditNodes } = beforeUpdateAppFormat({ nodes: editNodes });

  const scheduledTriggerConfig = version.chatConfig?.scheduledTriggerConfig;

  await mongoSessionRun(async (session) => {
    // 为编辑中的数据创建一个版本
    await MongoAppVersion.create(
      [
        {
          appId,
          nodes: formatEditNodes,
          edges: editEdges,
          chatConfig: editChatConfig
        }
      ],
      { session }
    );

    // 为历史版本再创建一个版本
    const [{ _id }] = await MongoAppVersion.create(
      [
        {
          appId,
          nodes: version.nodes,
          edges: version.edges,
          chatConfig: version.chatConfig
        }
      ],
      { session }
    );

    // update app
    await MongoApp.findByIdAndUpdate(appId, {
      modules: version.nodes,
      edges: version.edges,
      chatConfig: version.chatConfig,
      updateTime: new Date(),
      scheduledTriggerConfig: scheduledTriggerConfig ? scheduledTriggerConfig : null,
      scheduledTriggerNextTime: scheduledTriggerConfig?.cronString
        ? getNextTimeByCronStringAndTimezone(scheduledTriggerConfig)
        : null,
      'pluginData.nodeVersion': _id
    });
  });

  return {};
}

export default NextAPI(handler);
