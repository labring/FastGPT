import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { beforeUpdateAppFormat } from '@fastgpt/service/core/app/controller';
import { getNextTimeByCronStringAndTimezone } from '@fastgpt/global/common/string/time';
import { type PostPublishAppProps } from '@/global/core/app/api';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { rewriteAppWorkflowToSimple } from '@fastgpt/service/core/app/utils';
import { addOperationLog } from '@fastgpt/service/support/operationLog/addOperationLog';
import { OperationLogEventEnum } from '@fastgpt/global/support/operationLog/constants';
import { getI18nAppType } from '@fastgpt/service/support/operationLog/util';
import { i18nT } from '@fastgpt/web/i18n/utils';
async function handler(req: ApiRequestProps<PostPublishAppProps>, res: NextApiResponse<any>) {
  const { appId } = req.query as { appId: string };
  const { nodes = [], edges = [], chatConfig, isPublish, versionName, autoSave } = req.body;

  const { app, tmbId, teamId } = await authApp({
    appId,
    req,
    per: WritePermissionVal,
    authToken: true
  });

  const { nodes: formatNodes } = beforeUpdateAppFormat({
    nodes,
    isPlugin: app.type === AppTypeEnum.plugin
  });

  await rewriteAppWorkflowToSimple(formatNodes);

  if (autoSave) {
    await MongoApp.findByIdAndUpdate(appId, {
      modules: formatNodes,
      edges,
      chatConfig,
      updateTime: new Date()
    });

    addOperationLog({
      tmbId,
      teamId,
      event: OperationLogEventEnum.UPDATE_PUBLISH_APP,
      params: {
        appName: app.name,
        operationName: i18nT('account_team:update'),
        appId,
        appType: getI18nAppType(app.type)
      }
    });

    return;
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
      { session, ordered: true }
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

  (async () => {
    addOperationLog({
      tmbId,
      teamId,
      event: OperationLogEventEnum.UPDATE_PUBLISH_APP,
      params: {
        appName: app.name,
        operationName: isPublish
          ? i18nT('account_team:save_and_publish')
          : i18nT('account_team:update'),
        appId,
        appType: getI18nAppType(app.type)
      }
    });
  })();
}

export default NextAPI(handler);
