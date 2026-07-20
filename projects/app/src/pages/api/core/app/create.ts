import { NextAPI } from '@/service/middleware/entry';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AppFolderTypeList, ToolTypeList, AppTypeList } from '@fastgpt/global/core/app/constants';
import type { AppSchemaType } from '@fastgpt/global/core/app/type';
import {
  CreateAppBodySchema,
  CreateAppResponseSchema,
  type CreateAppBodyType
} from '@fastgpt/global/openapi/core/app/common/api';
import {
  OwnerRoleVal,
  PerResourceTypeEnum,
  ReadPermissionVal,
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
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { normalizeWorkflowConfig } from '@fastgpt/global/core/workflow/utils';
import { authModels } from '@fastgpt/service/support/permission/model/auth';
import { extractWorkflowModelIds } from '@fastgpt/global/core/workflow/utils';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { isS3ObjectKey } from '@fastgpt/service/common/s3/utils';
import { MongoAppTemplate } from '@fastgpt/service/core/app/templates/templateSchema';
import { isPluginSystemTemplate } from '@fastgpt/service/core/app/templates/register';
import {
  beforeUpdateAppFormat,
  validatePublishAppAgentSkillReadPermissions,
  updateParentFoldersUpdateTime
} from '@fastgpt/service/core/app/controller';
import { copyAvatarImage } from '@fastgpt/service/common/file/image/controller';
import { extractAppResourceRefsFromNodes } from '@fastgpt/service/core/app/resourceRefs';

import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: ApiRequestProps<CreateAppBodyType>) {
  const { body } = parseApiInput({
    req,
    bodySchema: CreateAppBodySchema
  });
  const { parentId, name, avatar, intro, type, modules, edges, chatConfig, templateId, utmParams } =
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
    avatar,
    intro,
    type,
    modules: await (async () => {
      if (modules) {
        // Model permission: reject unauthorized modelIds in submitted nodes
        // (mirror app/update AUTH-TC10). Lenient blanking is unnecessary on the
        // backend — the model picker only lists accessible models, templates can
        // only reference system models (resolveModelId without teamId), and the
        // frontend import flow already strips unauthorized models before submit.
        const modelIds = extractWorkflowModelIds({ modules, chatConfig });
        if (modelIds.length > 0) {
          await authModels({
            req,
            authToken: true,
            modelIds,
            per: ReadPermissionVal
          });
        }
        return modules;
      }
      return [];
    })(),
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
  modules,
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
  modules?: AppSchemaType['modules'];
  edges?: AppSchemaType['edges'];
  chatConfig?: AppSchemaType['chatConfig'];
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

  const normalizedWorkflow = normalizeWorkflowConfig({
    nodes: modules ?? [],
    edges: edges ?? [],
    chatConfig
  });

  await beforeUpdateAppFormat({ nodes: normalizedWorkflow.nodes, teamId });
  if (!AppFolderTypeList.includes(type!)) {
    await validatePublishAppAgentSkillReadPermissions({
      nodes: normalizedWorkflow.nodes,
      tmbId,
      isRoot
    });
  }

  const create = async (session: ClientSession) => {
    const resourceRefs = extractAppResourceRefsFromNodes(normalizedWorkflow.nodes);
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
          modules: normalizedWorkflow.nodes,
          edges: normalizedWorkflow.edges,
          chatConfig: normalizedWorkflow.chatConfig,
          type,
          version: 'v2',
          pluginData,
          templateId,
          ...(!AppFolderTypeList.includes(type!) && { resourceRefs })
        }
      ],
      { session, ordered: true }
    );

    const appId = String(app._id);

    if (!AppFolderTypeList.includes(type!)) {
      await MongoAppVersion.create(
        [
          {
            tmbId,
            appId,
            nodes: normalizedWorkflow.nodes,
            edges: normalizedWorkflow.edges,
            chatConfig: normalizedWorkflow.chatConfig,
            versionName: name,
            username,
            avatar: userAvatar,
            isPublish: true,
            resourceRefs
          }
        ],
        { session, ordered: true }
      );
    }

    await MongoResourcePermission.insertOne({
      teamId,
      tmbId,
      resourceId: appId,
      permission: OwnerRoleVal,
      resourceType: PerResourceTypeEnum.app
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
