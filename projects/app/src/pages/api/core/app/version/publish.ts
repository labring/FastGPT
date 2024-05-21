import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/auth/app';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { beforeUpdateAppFormat } from '@fastgpt/service/core/app/controller';
import { getNextTimeByCronStringAndTimezone } from '@fastgpt/global/common/string/time';
import { PostPublishAppProps } from '@/global/core/app/api';

type Response = {};

async function handler(req: NextApiRequest, res: NextApiResponse<any>): Promise<{}> {
  const { appId } = req.query as { appId: string };
  const { nodes = [], edges = [], chatConfig, type } = req.body as PostPublishAppProps;

  await authApp({ appId, req, per: 'w', authToken: true });

  const { nodes: formatNodes } = beforeUpdateAppFormat({ nodes });

  await mongoSessionRun(async (session) => {
    // create version histories
    await MongoAppVersion.create(
      [
        {
          appId,
          nodes: formatNodes,
          edges,
          chatConfig
        }
      ],
      { session }
    );

    // update app
    await MongoApp.findByIdAndUpdate(appId, {
      modules: formatNodes,
      edges,
      chatConfig,
      updateTime: new Date(),
      version: 'v2',
      type,
      scheduledTriggerConfig: chatConfig?.scheduledTriggerConfig,
      scheduledTriggerNextTime: chatConfig?.scheduledTriggerConfig
        ? getNextTimeByCronStringAndTimezone(chatConfig.scheduledTriggerConfig)
        : null
    });
  });

  return {};
}

export default NextAPI(handler);
