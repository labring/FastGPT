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
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nAppType } from '@fastgpt/service/support/user/audit/util';
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

  beforeUpdateAppFormat({
    nodes
  });

  if (autoSave) {
    await MongoApp.findByIdAndUpdate(appId, {
      modules: nodes,
      edges,
      chatConfig,
      updateTime: new Date()
    });

    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.UPDATE_PUBLISH_APP,
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
          nodes: nodes,
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
        modules: nodes,
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
    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.UPDATE_PUBLISH_APP,
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
