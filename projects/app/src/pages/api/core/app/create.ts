import { NextAPI } from '@/service/middleware/entry';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AppFolderTypeList, ToolTypeList, AppTypeList } from '@fastgpt/global/core/app/constants';
import type { AppResourcesType } from '@fastgpt/global/core/app/type';
import type { AppSchemaType } from '@fastgpt/global/core/app/type';
import type { AppVersionSchemaType } from '@fastgpt/global/core/app/version/type';
import {
  CreateAppRequestBodySchema,
  CreateAppResponseSchema,
  type CreateAppBodyType
} from '@fastgpt/global/openapi/core/app/common/api';
import {
  PerResourceTypeEnum,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { TeamAppCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { type ClientSession } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { checkTeamAppTypeLimit } from '@fastgpt/service/support/permission/teamLimit';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nAppType } from '@fastgpt/service/support/user/audit/util';
import { createResourceDefaultCollaborators } from '@fastgpt/service/support/permission/controller';
import { formatModels } from '@fastgpt/global/core/workflow/utils';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { isS3ObjectKey } from '@fastgpt/service/common/s3/utils';
import { MongoAppTemplate } from '@fastgpt/service/core/app/templates/templateSchema';
import { isPluginSystemTemplate } from '@fastgpt/service/core/app/templates/register';
import {
  beforeUpdateAppFormat,
  updateParentFoldersUpdateTime
} from '@fastgpt/service/core/app/controller';
import { migrateWorkflowToCurrent } from '@fastgpt/global/core/workflow/migration';
import { copyAvatarImage } from '@fastgpt/service/common/file/image/controller';
import { extractAppResources } from '@fastgpt/service/core/app/resources';
import { checkAppResourceReadPermissions } from '@fastgpt/service/support/permission/app/resource';
import { getSystemDefaultModelIds } from '@fastgpt/service/core/ai/model';

import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: ApiRequestProps<CreateAppBodyType>) {
  const { body } = parseApiInput({
    req,
    bodySchema: CreateAppRequestBodySchema
  });
  const { parentId, name, avatar, intro, type, nodes, edges, chatConfig, templateId, utmParams } =
    body;

  // 凭证校验
  const { teamId, tmbId, userId, isRoot } = parentId
    ? await authApp({
        req,
        appId: parentId,
        authToken: true,
        authApiKey: true,
        per: WritePermissionVal
      })
    : await authUserPer({
        req,
        authToken: true,
        authApiKey: true,
        per: TeamAppCreatePermissionVal
      });

  // 上限校验
  await checkTeamAppTypeLimit({
    teamId,
    appCheckType: type === AppTypeEnum.workflowTool ? 'tool' : 'app'
  });

  const tmb = await MongoTeamMember.findById({ _id: tmbId }, 'userId')
    .populate<{
      user: { username: string };
    }>('user', 'username')
    .lean();

  // 创建app
  const appId = await onCreateApp({
    parentId,
    name,
    avatar: avatar ?? undefined,
    intro: intro ?? undefined,
    type,
    nodes,
    edges,
    chatConfig,
    teamId,
    tmbId,
    userAvatar: tmb?.avatar,
    username: tmb?.user?.username,
    templateId,
    isRoot
  });

  pushTrack.createApp({
    type,
    uid: userId,
    teamId,
    tmbId,
    appId,
    ...utmParams
  });

  return CreateAppResponseSchema.parse(appId);
}

export default NextAPI(handler);
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '5mb'
    }
  }
};

export const onCreateApp = async ({
  parentId,
  name,
  intro,
  avatar,
  type,
  nodes,
  storageNodes,
  edges,
  chatConfig,
  teamId,
  tmbId,
  pluginData,
  username,
  userAvatar,
  templateId,
  isRoot,
  session
}: {
  parentId?: ParentIdType;
  name?: string;
  avatar?: string;
  type: AppTypeEnum;
  nodes?: unknown[];
  storageNodes?: AppVersionSchemaType['nodes'];
  edges?: AppVersionSchemaType['edges'];
  chatConfig?: AppVersionSchemaType['chatConfig'];
  intro?: string;
  teamId: string;
  tmbId: string;
  pluginData?: AppSchemaType['pluginData'];
  username?: string;
  userAvatar?: string;
  templateId?: string;
  isRoot?: boolean;
  session?: ClientSession;
}) => {
  if (parentId) {
    const parentApp = await MongoApp.findById(parentId, 'type').lean();

    if (ToolTypeList.includes(type) && parentApp?.type !== AppTypeEnum.toolFolder) {
      return Promise.reject('tool type can only be created in tool folder');
    }
    if (AppTypeList.includes(type) && parentApp?.type !== AppTypeEnum.folder) {
      return Promise.reject('agent type can only be created in agent folder');
    }
  }

  // Copy 和 Transition 会传入历史数据库记录；写入前统一转换为 canonical 并格式化敏感字段。
  const normalizedWorkflow = migrateWorkflowToCurrent({
    nodes: nodes ?? [],
    edges: edges ?? [],
    chatConfig
  });
  formatModels({
    nodes: normalizedWorkflow.nodes,
    chatConfig: normalizedWorkflow.chatConfig,
    models: global.systemActiveModelList,
    defaultModelIds: getSystemDefaultModelIds(),
    modelReferencePolicy: 'fallback'
  });
  await beforeUpdateAppFormat({ nodes: normalizedWorkflow.nodes, teamId });
  const resources = extractAppResources({
    nodes: normalizedWorkflow.nodes,
    chatConfig: normalizedWorkflow.chatConfig
  });
  if (!AppFolderTypeList.includes(type!)) {
    await checkAppResourceReadPermissions({
      resources,
      tmbId,
      isRoot
    });
  }

  const create = async (session: ClientSession) => {
    const _avatar = await (async () => {
      if (!templateId || isPluginSystemTemplate(templateId)) return avatar;

      const template = await MongoAppTemplate.findOne({ templateId }, 'avatar').lean();
      if (!template?.avatar) return avatar;

      const s3AvatarSource = getS3AvatarSource();
      if (!isS3ObjectKey(template.avatar?.slice(s3AvatarSource.prefix.length), 'avatar')) {
        return template.avatar;
      }

      return await copyAvatarImage({
        teamId,
        imageUrl: template.avatar,
        temporary: true,
        session
      });
    })();

    const [app] = await MongoApp.create(
      [
        {
          ...parseParentIdInMongo(parentId),
          avatar: _avatar,
          name,
          intro,
          teamId,
          tmbId,
          type,
          version: 'v2',
          pluginData,
          templateId
        }
      ],
      { session, ordered: true }
    );

    const appId = String(app._id);

    if (!AppFolderTypeList.includes(type!)) {
      const [version] = await MongoAppVersion.create(
        [
          {
            tmbId,
            appId,
            nodes: storageNodes ?? normalizedWorkflow.nodes,
            edges: normalizedWorkflow.edges,
            chatConfig: normalizedWorkflow.chatConfig,
            versionName: name,
            username,
            avatar: userAvatar,
            isPublish: true,
            resources
          }
        ],
        { session, ordered: true }
      );
      await MongoApp.updateOne(
        { _id: appId },
        {
          $set: {
            publishedVersionId: version._id,
            'pluginData.nodeVersion': version._id
          }
        },
        { session }
      );
    }

    await createResourceDefaultCollaborators({
      resource: app,
      resourceType: PerResourceTypeEnum.app,
      tmbId,
      session
    });

    await getS3AvatarSource().refreshAvatar(_avatar, undefined, session);

    updateParentFoldersUpdateTime({
      parentId
    });

    (async () => {
      addAuditLog({
        tmbId,
        teamId,
        event: AuditEventEnum.CREATE_APP,
        params: {
          appName: name!,
          appType: getI18nAppType(type!)
        }
      });
    })();

    return appId;
  };

  if (session) {
    return create(session);
  } else {
    return await mongoSessionRun(create);
  }
};

/**
 * 将已有应用转换为 workflow 时写入其 workflow 数据。
 *
 * 该入口只服务 Transition 的 createNew=false 分支：源 workflow 可能是历史数据，写入前统一
 * 产出 canonical 数据并格式化敏感字段。resources 直接复用当前最新 Version 的权限快照，不按
 * 转化操作者重新校验或过滤。调用方必须传入同一事务的 session，普通更新接口不复用。
 */
export const onUpdateAppWorkflow = async ({
  appId,
  nodes,
  edges,
  chatConfig,
  resources,
  teamId,
  tmbId,
  session
}: {
  appId: string;
  nodes?: AppVersionSchemaType['nodes'];
  edges?: AppVersionSchemaType['edges'];
  chatConfig?: AppVersionSchemaType['chatConfig'];
  resources: AppResourcesType;
  teamId: string;
  tmbId: string;
  session?: ClientSession;
}) => {
  const workflow = migrateWorkflowToCurrent({
    nodes: nodes ?? [],
    edges: edges ?? [],
    chatConfig
  });
  formatModels({
    nodes: workflow.nodes,
    chatConfig: workflow.chatConfig,
    models: global.systemActiveModelList,
    defaultModelIds: getSystemDefaultModelIds(),
    modelReferencePolicy: 'fallback'
  });
  await beforeUpdateAppFormat({ nodes: workflow.nodes, teamId });

  await MongoAppVersion.findOneAndUpdate(
    { appId, isAutoSave: true },
    {
      tmbId,
      appId,
      isAutoSave: true,
      nodes: workflow.nodes,
      edges: workflow.edges,
      chatConfig: workflow.chatConfig,
      time: new Date(),
      resources
    },
    { session, upsert: true, new: true }
  );

  return MongoApp.findByIdAndUpdate(
    appId,
    {
      type: AppTypeEnum.workflow,
      updateTime: new Date()
    },
    { session }
  );
};
