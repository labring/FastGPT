import { type PostPublishAppProps } from '@/global/core/app/api';
import { NextAPI } from '@/service/middleware/entry';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { getNextTimeByCronStringAndTimezone } from '@fastgpt/global/common/string/time';
import { getInputReferences } from '@fastgpt/global/core/workflow/editor/runtime/kernel';
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
import type { ClientSession } from '@fastgpt/service/common/mongo';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
import {
  beforeUpdateAppFormat,
  updateParentFoldersUpdateTime
} from '@fastgpt/service/core/app/controller';
import { extractAppResources } from '@fastgpt/service/core/app/resources';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { getAppDraftVersion } from '@fastgpt/service/core/app/version/controller';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { resolveAppResourcesByPermission } from '@fastgpt/service/support/permission/app/resource';
import { addAuditLog, getI18nAppType } from '@fastgpt/service/support/user/audit/util';

async function handler(req: ApiRequestProps<PostPublishAppProps>) {
  const {
    query: { appId },
    body: {
      nodes = [],
      edges = [],
      chatConfig,
      referenceSnapshots,
      isPublish,
      versionName,
      autoSave
    }
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

  const normalizedWorkflow = migrateWorkflowToCurrent({
    nodes,
    edges,
    chatConfig,
    referenceSnapshots
  });
  const modelHandle = await getTeamModelHandle({ teamId });
  formatModels({
    nodes: normalizedWorkflow.nodes,
    chatConfig: normalizedWorkflow.chatConfig,
    models: modelHandle.getActiveModels(),
    defaultModelIds: modelHandle.getSystemDefaultModelIds(),
    modelReferencePolicy: isPublish ? 'validate' : 'preserve'
  });
  await beforeUpdateAppFormat({
    nodes: normalizedWorkflow.nodes,
    teamId
  });
  const extracted = extractAppResources({
    nodes: normalizedWorkflow.nodes,
    chatConfig: normalizedWorkflow.chatConfig,
    models: modelHandle.getAllModels()
  });

  /** 请求省略快照时，从事务内最新草稿继承仍被引用且当前来源不可解析的展示元数据。 */
  const resolveReferenceSnapshots = async (session: ClientSession) => {
    if (referenceSnapshots !== undefined) return normalizedWorkflow.referenceSnapshots;

    const draft = await getAppDraftVersion(appId, session);
    const references = new Set(
      normalizedWorkflow.nodes.flatMap((node) =>
        node.inputs.flatMap((input) =>
          getInputReferences(input).map((reference) => reference.join('\0'))
        )
      )
    );
    const outputsByNode = new Map(
      normalizedWorkflow.nodes.map(
        (node) => [node.nodeId, new Set(node.outputs?.map((output) => output.id) ?? [])] as const
      )
    );

    return (draft?.referenceSnapshots ?? []).filter(({ reference }) => {
      if (!references.has(reference.join('\0'))) return false;
      const outputId = reference[1];
      return outputId === undefined || !outputsByNode.get(reference[0])?.has(outputId);
    });
  };

  if (autoSave) {
    await mongoSessionRun(async (session) => {
      // baseline 必须在事务内读取，事务重试时才能按最新草稿重新计算资源快照。
      const resolvedReferenceSnapshots = await resolveReferenceSnapshots(session);
      const resources = await resolveAppResourcesByPermission({
        appId,
        extracted,
        tmbId,
        isRoot,
        blockOnUnauthorized: false,
        session
      });
      await MongoAppVersion.findOneAndUpdate(
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
          referenceSnapshots: resolvedReferenceSnapshots,
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
    });

    updateParentFoldersUpdateTime({
      parentId: app.parentId
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
    // baseline 必须在事务内读取，事务重试时才能按最新草稿重新计算资源快照。
    const resolvedReferenceSnapshots = await resolveReferenceSnapshots(session);
    const resources = await resolveAppResourcesByPermission({
      appId,
      extracted,
      tmbId,
      isRoot,
      blockOnUnauthorized: !!isPublish,
      session
    });

    // create version histories
    const [{ _id }] = await MongoAppVersion.create(
      [
        {
          appId,
          nodes: normalizedWorkflow.nodes,
          edges: normalizedWorkflow.edges,
          chatConfig: normalizedWorkflow.chatConfig,
          referenceSnapshots: resolvedReferenceSnapshots,
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
  });

  updateParentFoldersUpdateTime({
    parentId: app.parentId
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
