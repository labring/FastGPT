import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import {
  beforeUpdateAppFormat,
  validatePublishAppAgentSkillReadPermissions
} from '@fastgpt/service/core/app/controller';
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
import { extractAppResourceRefsFromNodes } from '@fastgpt/service/core/app/resourceRefs';
import { formatModels } from '@fastgpt/global/core/workflow/utils';
import { getSystemDefaultModelIds } from '@fastgpt/service/core/ai/model';
import { compactWorkflowToolConfigsForStorage } from '@fastgpt/service/core/app/jsonSchemaStorage';
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
  const storageNodes = compactWorkflowToolConfigsForStorage(normalizedWorkflow.nodes);
  if (isPublish) {
    await validatePublishAppAgentSkillReadPermissions({
      nodes: normalizedWorkflow.nodes,
      tmbId,
      isRoot
    });
  }
  const resourceRefs = extractAppResourceRefsFromNodes(normalizedWorkflow.nodes);
  updateParentFoldersUpdateTime({
    parentId: app.parentId
  });

  if (autoSave) {
    await mongoSessionRun(async (session) => {
      await MongoAppVersion.updateOne(
        {
          appId,
          isAutoSave: true
        },
        {
          tmbId,
          appId,
          nodes: storageNodes,
          edges: normalizedWorkflow.edges,
          chatConfig: normalizedWorkflow.chatConfig,
          versionName: i18nT('app:auto_save'),
          time: new Date(),
          resourceRefs
        },

        { session, upsert: true }
      );

      await MongoApp.updateOne(
        { _id: appId },
        {
          modules: storageNodes,
          edges: normalizedWorkflow.edges,
          chatConfig: normalizedWorkflow.chatConfig,
          updateTime: new Date()
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
          nodes: storageNodes,
          edges: normalizedWorkflow.edges,
          chatConfig: normalizedWorkflow.chatConfig,
          isPublish,
          versionName,
          tmbId,
          resourceRefs
        }
      ],
      { session, ordered: true }
    );

    // update app
    const setUpdate = {
      modules: storageNodes,
      edges: normalizedWorkflow.edges,
      chatConfig: normalizedWorkflow.chatConfig,
      updateTime: new Date(),
      version: 'v2',
      ...(isPublish && { resourceRefs }),
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
