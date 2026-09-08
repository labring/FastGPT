import { type PostPublishAppProps } from '@/global/core/app/api';
import { authModelViewer } from '@/service/core/ai/model/auth';
import { NextAPI } from '@/service/middleware/entry';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { getNextTimeByCronStringAndTimezone } from '@fastgpt/global/common/string/time';
import { migrateWorkflowToCurrent } from '@fastgpt/global/core/workflow/migration';
import { formatModels } from '@fastgpt/global/core/workflow/utils';
import {
  PublishAppBodySchema,
  PublishAppQuerySchema,
  PublishAppResponseSchema
} from '@fastgpt/global/openapi/core/app/version/api';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getSystemDefaultModelIds } from '@fastgpt/service/core/ai/model';
import {
  beforeUpdateAppFormat,
  updateParentFoldersUpdateTime,
  validatePublishAppAgentSkillReadPermissions
} from '@fastgpt/service/core/app/controller';
import { extractAppResourceRefsFromNodes } from '@fastgpt/service/core/app/resourceRefs';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { getMemberModelIds } from '@fastgpt/service/support/permission/model/controller';
import { addAuditLog, getI18nAppType } from '@fastgpt/service/support/user/audit/util';

/** 发布仅校验当前成员可用模型，默认回填也限于该范围；草稿保留原引用供继续编辑。 */
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
  const models = await (async () => {
    if (!isPublish) return global.systemActiveModelList;
    // 与客户端 catalog 使用相同身份和权限规则，不能用应用所有者替代当前发布者。
    const identity = await authModelViewer({ req });
    const permittedIds = new Set(await getMemberModelIds(identity));
    return global.systemActiveModelList.filter((model) => permittedIds.has(model.modelId));
  })();
  formatModels({
    nodes: normalizedWorkflow.nodes,
    chatConfig: normalizedWorkflow.chatConfig,
    models,
    defaultModelIds: getSystemDefaultModelIds(),
    modelReferencePolicy: isPublish ? 'validate' : 'preserve'
  });
  await beforeUpdateAppFormat({
    nodes: normalizedWorkflow.nodes,
    teamId
  });
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
          nodes: normalizedWorkflow.nodes,
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
          modules: normalizedWorkflow.nodes,
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
          nodes: normalizedWorkflow.nodes,
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
      modules: normalizedWorkflow.nodes,
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
