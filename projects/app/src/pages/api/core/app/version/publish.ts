import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { beforeUpdateAppFormat } from '@fastgpt/service/core/app/controller';
import { migrateWorkflowToCurrent } from '@fastgpt/global/core/workflow/migration';
import { getNextTimeByCronStringAndTimezone } from '@fastgpt/global/common/string/time';
import { type PostPublishAppProps } from '@/global/core/app/api';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nAppType } from '@fastgpt/service/support/user/audit/util';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { updateParentFoldersUpdateTime } from '@fastgpt/service/core/app/controller';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { extractAppResources } from '@fastgpt/service/core/app/resources';
import { resolveAppResourcesByPermission } from '@fastgpt/service/support/permission/app/resource';
import { formatModels } from '@fastgpt/global/core/workflow/utils';
import { getSystemDefaultModelIds } from '@fastgpt/service/core/ai/model';
import {
  PublishAppBodySchema,
  PublishAppQuerySchema,
  PublishAppResponseSchema
} from '@fastgpt/global/openapi/core/app/version/api';

async function handler(req: ApiRequestProps<PostPublishAppProps>) {
  const {
    query: { appId },
    body: { nodes = [], edges = [], chatConfig, isPublish, versionName, autoSave }
  } = parseApiInput({
    req,
    querySchema: PublishAppQuerySchema,
    bodySchema: PublishAppBodySchema
  });

  const { app, tmbId, teamId, isRoot } = await authApp({
    appId,
    req,
    per: WritePermissionVal,
    authToken: true
  });

  const normalizedWorkflow = migrateWorkflowToCurrent({ nodes, edges, chatConfig });
  formatModels({
    nodes: normalizedWorkflow.nodes,
    chatConfig: normalizedWorkflow.chatConfig,
    models: global.systemActiveModelList,
    defaultModelIds: getSystemDefaultModelIds(),
    modelReferencePolicy: isPublish ? 'validate' : 'preserve'
  });
  await beforeUpdateAppFormat({
    nodes: normalizedWorkflow.nodes,
    teamId
  });
  const extracted = extractAppResources({
    nodes: normalizedWorkflow.nodes,
    chatConfig: normalizedWorkflow.chatConfig
  });
  const resources = await resolveAppResourcesByPermission({
    appId,
    app,
    extracted,
    tmbId,
    isRoot,
    blockOnUnauthorized: !autoSave && !!isPublish
  });
  updateParentFoldersUpdateTime({
    parentId: app.parentId
  });

  if (autoSave) {
    await mongoSessionRun(async (session) => {
      const autoSaveVersion = await MongoAppVersion.findOneAndUpdate(
        {
          appId,
          isAutoSave: true
        },
        {
          tmbId,
          appId,
          isAutoSave: true,
          nodes: normalizedWorkflow.nodes,
          edges: normalizedWorkflow.edges,
          chatConfig: normalizedWorkflow.chatConfig,
          versionName: i18nT('app:auto_save'),
          time: new Date(),
          resources
        },

        { session, upsert: true, new: true }
      );

      await MongoApp.updateOne(
        { _id: appId },
        {
          updateTime: new Date(),
          ...(autoSaveVersion?._id ? { draftVersionId: autoSaveVersion._id } : {})
        },
        {
          session
        }
      );
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

    return PublishAppResponseSchema.parse(undefined);
  }

  await mongoSessionRun(async (session) => {
    // create version histories
    const [{ _id }] = await MongoAppVersion.create(
      [
        {
          appId,
          nodes: normalizedWorkflow.nodes,
          edges: normalizedWorkflow.edges,
          chatConfig: normalizedWorkflow.chatConfig,
          isPublish,
          versionName,
          tmbId,
          resources
        }
      ],
      { session, ordered: true }
    );

    // update app
    const setUpdate = {
      updateTime: new Date(),
      version: 'v2',
      draftVersionId: _id,
      ...(isPublish && { publishedVersionId: _id }),
      ...(isPublish && normalizedWorkflow.chatConfig.scheduledTriggerConfig?.cronString
        ? {
            scheduledTriggerConfig: normalizedWorkflow.chatConfig.scheduledTriggerConfig,
            scheduledTriggerNextTime: getNextTimeByCronStringAndTimezone(
              normalizedWorkflow.chatConfig.scheduledTriggerConfig
            )
          }
        : {}),
      'pluginData.nodeVersion': _id
    };
    await MongoApp.updateOne(
      { _id: appId },
      {
        $set: setUpdate,
        ...(isPublish && !normalizedWorkflow.chatConfig.scheduledTriggerConfig?.cronString
          ? { $unset: { scheduledTriggerConfig: '', scheduledTriggerNextTime: '' } }
          : {})
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

  return PublishAppResponseSchema.parse(undefined);
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '5mb'
    }
  }
};
