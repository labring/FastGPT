import { NextAPI } from '@/service/middleware/entry';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { AppFolderTypeList, AppTypeEnum, ToolTypeList } from '@fastgpt/global/core/app/constants';
import type { AppResourcesType, AppSchemaType } from '@fastgpt/global/core/app/type';
import type { AppVersionSchemaType } from '@fastgpt/global/core/app/version/type';
import { migrateWorkflowToCurrent } from '@fastgpt/global/core/workflow/migration';
import { formatModels } from '@fastgpt/global/common/workflow/model';
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
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { copyAvatarImage } from '@fastgpt/service/common/file/image/controller';
import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';
import { type ClientSession } from '@fastgpt/service/common/mongo';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { isS3ObjectKey } from '@fastgpt/service/common/s3/utils';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
import {
  beforeUpdateAppFormat,
  updateParentFoldersUpdateTime
} from '@fastgpt/service/core/app/controller';
import { extractAppResources } from '@fastgpt/service/core/app/resource/utils';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { isPluginSystemTemplate } from '@fastgpt/service/core/app/templates/register';
import { MongoAppTemplate } from '@fastgpt/service/core/app/templates/templateSchema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { checkAppResourceReadPermissions } from '@fastgpt/service/support/permission/app/resource';
import { createResourceDefaultCollaborators } from '@fastgpt/service/support/permission/controller';
import { getAuthorizedModelIds } from '@fastgpt/service/support/permission/model/auth';
import { checkTeamAppTypeLimit } from '@fastgpt/service/support/permission/teamLimit';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { addAuditLog, getI18nAppType } from '@fastgpt/service/support/user/audit/util';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { getFolderAncestorIdsFromParentId } from '@fastgpt/service/common/parentFolder/ancestorIds';
import { getAppFolderTree, validateParentFolderType } from '@fastgpt/service/core/app/folderTree';

import { checkCreateResourceParent } from '@fastgpt/service/common/parentFolder/depth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: ApiRequestProps<CreateAppBodyType>) {
  const { body } = parseApiInput({
    req,
    bodySchema: CreateAppRequestBodySchema
  });
  const {
    parentId,
    name,
    avatar,
    intro,
    type,
    nodes,
    edges,
    chatConfig,
    referenceSnapshots,
    templateId,
    utmParams
  } = body;

  // 凭证校验
  const { teamId, tmbId, isRoot } = parentId
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
    referenceSnapshots,
    teamId,
    tmbId,
    userAvatar: tmb?.avatar,
    username: tmb?.user?.username,
    templateId,
    isRoot
  });

  pushTrack.createApp({
    type,
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

/**
 * 新建应用及初始版本、默认协作者。所有新增入口统一校验配额、父链与目录深度，
 * 新建文件夹同时写入祖先路径；
 * 复制、转换新建和工具集创建传入的 session 会继续复用，原地转换不走此入口。
 */
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
  referenceSnapshots,
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
  referenceSnapshots?: AppVersionSchemaType['referenceSnapshots'];
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
  // 配额属于新增资源的约束，放在共享入口，避免复制或转换新建绕过路由校验。
  await checkTeamAppTypeLimit({
    teamId,
    appCheckType: AppFolderTypeList.includes(type)
      ? 'folder'
      : ToolTypeList.includes(type)
        ? 'tool'
        : 'app'
  });

  // 普通应用与工具分属两棵目录树，父文件夹类型必须是同一棵树内的文件夹。
  await validateParentFolderType({ parentId, childType: type, session });

  const folderTree = getAppFolderTree(type);
  await checkCreateResourceParent({
    parentId,
    findResource: (id) =>
      MongoApp.findOne({ _id: id, teamId }, '_id parentId type')
        .session(session ?? null)
        .lean(),
    isFolder: AppFolderTypeList.includes(type),
    isFolderType: (parentType) =>
      AppFolderTypeList.includes(parentType as AppTypeEnum) &&
      (!folderTree || getAppFolderTree(parentType) === folderTree)
  });

  // Copy 和 Transition 会传入历史数据库记录；写入前统一转换为 canonical 并格式化敏感字段。
  const normalizedWorkflow = migrateWorkflowToCurrent({
    nodes: nodes ?? [],
    edges: edges ?? [],
    chatConfig,
    referenceSnapshots
  });
  const modelHandle = await getTeamModelHandle({ teamId });
  const authorizedIds = await getAuthorizedModelIds({
    actor: { teamId, tmbId, isRoot: Boolean(isRoot) },
    handle: modelHandle
  });
  formatModels({
    nodes: normalizedWorkflow.nodes,
    chatConfig: normalizedWorkflow.chatConfig,
    models: modelHandle.getActiveModels(),
    defaultModelIds: modelHandle.getDefaultModelIds(authorizedIds),
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
      teamId,
      isRoot,
      modelHandle
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

    const ancestorIds = AppFolderTypeList.includes(type)
      ? await getFolderAncestorIdsFromParentId({
          parentId: parentId ? String(parentId) : null,
          findFolder: (id) =>
            MongoApp.findOne({ _id: id, teamId, type })
              .select('_id parentId')
              .session(session)
              .lean()
        })
      : undefined;

    const [app] = await MongoApp.create(
      [
        {
          ...parseParentIdInMongo(parentId),
          ...(ancestorIds ? { ancestorIds } : {}),
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
            referenceSnapshots: normalizedWorkflow.referenceSnapshots,
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
  referenceSnapshots,
  resources,
  teamId,
  tmbId,
  session
}: {
  appId: string;
  nodes?: AppVersionSchemaType['nodes'];
  edges?: AppVersionSchemaType['edges'];
  chatConfig?: AppVersionSchemaType['chatConfig'];
  referenceSnapshots?: AppVersionSchemaType['referenceSnapshots'];
  resources: AppResourcesType;
  teamId: string;
  tmbId: string;
  session?: ClientSession;
}) => {
  const workflow = migrateWorkflowToCurrent({
    nodes: nodes ?? [],
    edges: edges ?? [],
    chatConfig,
    referenceSnapshots
  });
  const modelHandle = await getTeamModelHandle({ teamId });
  const authorizedIds = await getAuthorizedModelIds({
    actor: { teamId, tmbId, isRoot: false },
    handle: modelHandle
  });
  formatModels({
    nodes: workflow.nodes,
    chatConfig: workflow.chatConfig,
    models: modelHandle.getActiveModels(),
    defaultModelIds: modelHandle.getDefaultModelIds(authorizedIds),
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
      referenceSnapshots: workflow.referenceSnapshots,
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
