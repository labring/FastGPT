import { type PostPublishAppProps } from '@/global/core/app/api';
import { NextAPI } from '@/service/middleware/entry';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { getNextTimeByCronStringAndTimezone } from '@fastgpt/global/common/string/time';
import { migrateWorkflowToCurrent } from '@fastgpt/global/core/workflow/migration';
import { formatModels } from '@fastgpt/global/common/workflow/model';
import {
  PublishAppBodySchema,
  PublishAppQuerySchema,
  PublishAppResponseSchema,
  PublishHttpToolSetAppBodySchema,
  PublishMcpToolSetAppBodySchema,
  type PublishAppResponseType
} from '@fastgpt/global/openapi/core/app/version/api';
import type { AppVersionSchemaType } from '@fastgpt/global/core/app/version/type';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
import {
  beforeUpdateAppFormat,
  updateParentFoldersUpdateTime
} from '@fastgpt/service/core/app/controller';
import { assertAppDatasetIndexModelsAvailable } from '@fastgpt/service/core/dataset/model';
import { extractAppResources } from '@fastgpt/service/core/app/resource/utils';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { getAuthorizedModelIds } from '@fastgpt/service/support/permission/model/auth';
import { resolveAppResourcesByPermission } from '@fastgpt/service/core/app/resource/service';
import { addAuditLog, getI18nAppType } from '@fastgpt/service/support/user/audit/util';
import { buildAppAuditResource } from '@fastgpt/global/support/user/audit/type';
import {
  normalizeAppVersionWorkflow,
  normalizeAppWorkflow
} from '@fastgpt/service/core/app/version/controller';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { rewriteAppWorkflowToDetail } from '@fastgpt/service/core/app/utils';
import { hasDebugToolInNodes } from '@fastgpt/global/core/app/utils';

/** 保存或发布应用版本，资源归属和模型目录以目标应用团队为边界，ACL 保留实际操作者身份。 */
async function handler(req: ApiRequestProps<PostPublishAppProps>): Promise<PublishAppResponseType> {
  const {
    query: { appId }
  } = parseApiInput({
    req,
    querySchema: PublishAppQuerySchema
  });

  const { app, tmbId, isRoot } = await authApp({
    appId,
    req,
    per: WritePermissionVal,
    authToken: true
  });

  const {
    body: { nodes = [], edges = [], chatConfig, isPublish, versionName, autoSave, returnWorkflow }
  } = parseApiInput({
    req,
    bodySchema: (() => {
      if (app.type === AppTypeEnum.mcpToolSet) return PublishMcpToolSetAppBodySchema;
      if (app.type === AppTypeEnum.httpToolSet) return PublishHttpToolSetAppBodySchema;
      return PublishAppBodySchema;
    })()
  });

  // Root 可管理其他团队的应用；登录团队不能替代应用团队决定资源归属、默认模型和审计范围。
  const teamId = String(app.teamId);
  const normalizedWorkflow = (() => {
    if (app.type === AppTypeEnum.mcpToolSet || app.type === AppTypeEnum.httpToolSet) {
      return normalizeAppWorkflow({ nodes, edges, chatConfig }, app.type);
    }
    return migrateWorkflowToCurrent({ nodes, edges, chatConfig });
  })();
  if (isPublish && hasDebugToolInNodes(normalizedWorkflow.nodes)) {
    return Promise.reject(i18nT('app:publish_remove_debug_tool_tip'));
  }
  const modelHandle = await getTeamModelHandle({ teamId });
  const authorizedIds = await getAuthorizedModelIds({
    actor: { teamId, tmbId, isRoot },
    handle: modelHandle
  });
  formatModels({
    nodes: normalizedWorkflow.nodes,
    chatConfig: normalizedWorkflow.chatConfig,
    models: modelHandle.getActiveModels(),
    defaultModelIds: modelHandle.getDefaultModelIds(authorizedIds),
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

  /** 从本次写入的快照构造回执，避免重读最新草稿时将其他成员的并发保存纳入同步基线。 */
  const createSaveResponse = async (
    savedVersion: AppVersionSchemaType | undefined
  ): Promise<PublishAppResponseType> => {
    if (!savedVersion) return;

    const workflow = normalizeAppVersionWorkflow(savedVersion, app.type);
    await rewriteAppWorkflowToDetail({
      nodes: workflow.nodes,
      teamId,
      viewerTmbId: tmbId,
      ownerTmbId: String(app.tmbId),
      isRoot,
      lang: getLocale(req),
      resources: workflow.resources
    });
    return PublishAppResponseSchema.parse({ workflow });
  };

  if (autoSave) {
    const savedVersion = await mongoSessionRun(async (session) => {
      // baseline 必须在事务内读取，事务重试时才能按最新草稿重新计算资源快照。
      const resources = await resolveAppResourcesByPermission({
        appId,
        extracted,
        tmbId,
        teamId,
        isRoot,
        blockOnUnauthorized: false,
        modelHandle,
        session
      });
      const version = await MongoAppVersion.findOneAndUpdate(
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

      const updateResult = await MongoApp.updateOne(
        { _id: appId },
        { $set: { updateTime: new Date() } },
        { session }
      );
      if (updateResult.matchedCount !== 1) throw AppErrEnum.unExist;
      return returnWorkflow ? version!.toObject() : undefined;
    });

    updateParentFoldersUpdateTime({
      parentId: app.parentId
    });

    addAuditLog({
      tmbId,
      teamId,
      event: AuditEventEnum.SAVE_APP,
      resources: [buildAppAuditResource(app)],
      params: {
        appName: app.name,
        appId: String(app._id),
        appType: getI18nAppType(app.type)
      }
    });

    return createSaveResponse(savedVersion);
  }

  const savedVersion = await mongoSessionRun(async (session) => {
    // baseline 必须在事务内读取，事务重试时才能按最新草稿重新计算资源快照。
    const resources = await resolveAppResourcesByPermission({
      appId,
      extracted,
      tmbId,
      teamId,
      isRoot,
      blockOnUnauthorized: !!isPublish,
      modelHandle,
      session
    });
    if (isPublish) {
      await assertAppDatasetIndexModelsAvailable({
        resources,
        teamId,
        modelHandle,
        authorizedIds,
        session
      });
    }

    // create version histories
    const [version] = await MongoAppVersion.create(
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
      ...(isPublish && { publishedVersionId: version._id }),
      ...(isPublish && normalizedWorkflow.chatConfig.scheduledTriggerConfig?.cronString
        ? {
            scheduledTriggerConfig: normalizedWorkflow.chatConfig.scheduledTriggerConfig,
            scheduledTriggerNextTime: getNextTimeByCronStringAndTimezone(
              normalizedWorkflow.chatConfig.scheduledTriggerConfig
            )
          }
        : {}),
      'pluginData.nodeVersion': version._id
    };
    const updateResult = await MongoApp.updateOne(
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
    if (updateResult.matchedCount !== 1) throw AppErrEnum.unExist;
    return returnWorkflow ? version.toObject() : undefined;
  });

  updateParentFoldersUpdateTime({
    parentId: app.parentId
  });

  (async () => {
    addAuditLog({
      tmbId,
      teamId,
      event: isPublish ? AuditEventEnum.PUBLISH_APP : AuditEventEnum.SAVE_APP,
      resources: [buildAppAuditResource(app)],
      params: {
        appName: app.name,
        appId: String(app._id),
        appType: getI18nAppType(app.type)
      }
    });
  })();

  return createSaveResponse(savedVersion);
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '5mb'
    }
  }
};
