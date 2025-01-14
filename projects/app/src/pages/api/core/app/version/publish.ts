import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { beforeUpdateAppFormat } from '@fastgpt/service/core/app/controller';
import { getNextTimeByCronStringAndTimezone } from '@fastgpt/global/common/string/time';
import { PostPublishAppProps } from '@/global/core/app/api';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

async function handler(req: ApiRequestProps<PostPublishAppProps>, res: NextApiResponse<any>) {
  const { appId } = req.query as { appId: string };
  const { nodes = [], edges = [], chatConfig, isPublish, versionName, autoSave } = req.body;

  const { app, tmbId } = await authApp({ appId, req, per: WritePermissionVal, authToken: true });

  const { nodes: formatNodes } = beforeUpdateAppFormat({
    nodes,
    isPlugin: app.type === AppTypeEnum.plugin
  });

  if (autoSave) {
    return MongoApp.findByIdAndUpdate(appId, {
      modules: formatNodes,
      edges,
      chatConfig,
      updateTime: new Date()
    });
  }

  await mongoSessionRun(async (session) => {
    // create version histories
    const [{ _id }] = await MongoAppVersion.create(
      [
        {
          appId,
          nodes: formatNodes,
          edges,
          chatConfig,
          isPublish,
          versionName,
          tmbId
        }
      ],
      { session }
    );

    // update app
    await MongoApp.findByIdAndUpdate(
      appId,
      {
        modules: formatNodes,
        edges,
        chatConfig,
        updateTime: new Date(),
        version: 'v2',
        // 只有发布才会更新定时器
        ...(isPublish &&
          (chatConfig?.scheduledTriggerConfig?.cronString
            ? {
                $set: {
                  scheduledTriggerConfig: chatConfig.scheduledTriggerConfig,
                  scheduledTriggerNextTime: getNextTimeByCronStringAndTimezone(
                    chatConfig.scheduledTriggerConfig
                  )
                }
              }
            : { $unset: { scheduledTriggerConfig: '', scheduledTriggerNextTime: '' } })),
        'pluginData.nodeVersion': _id
      },
      {
        session
      }
    );
  });
}

export default NextAPI(handler);
