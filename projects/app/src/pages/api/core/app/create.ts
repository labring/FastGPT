import { NextAPI } from '@/service/middleware/entry';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { parseParentIdInMongo } from '@fastgpt/global/common/parentFolder/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { AppFolderTypeList, ToolTypeList, AppTypeList } from '@fastgpt/global/core/app/constants';
import type { AppSchema } from '@fastgpt/global/core/app/type';
import { type ShortUrlParams } from '@fastgpt/global/support/marketing/type';
import {
  OwnerRoleVal,
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
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { addAuditLog } from '@fastgpt/service/support/user/audit/util';
import { AuditEventEnum } from '@fastgpt/global/support/user/audit/constants';
import { getI18nAppType } from '@fastgpt/service/support/user/audit/util';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getMyModels } from '@fastgpt/service/support/permission/model/controller';
import { removeUnauthModels } from '@fastgpt/global/core/workflow/utils';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { isS3ObjectKey } from '@fastgpt/service/common/s3/utils';
import { MongoAppTemplate } from '@fastgpt/service/core/app/templates/templateSchema';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import path from 'node:path';
import { updateParentFoldersUpdateTime } from '@fastgpt/service/core/app/controller';

export type CreateAppBody = {
  parentId?: ParentIdType;
  name?: string;
  avatar?: string;
  intro?: string;
  type?: AppTypeEnum;
  modules: AppSchema['modules'];
  edges?: AppSchema['edges'];
  chatConfig?: AppSchema['chatConfig'];

  templateId?: string;
  utmParams?: ShortUrlParams;
};

async function handler(req: ApiRequestProps<CreateAppBody>) {
  let { parentId, name, avatar, intro, type, modules, edges, chatConfig, templateId, utmParams } =
    req.body;

  if (!name || !type || !Array.isArray(modules)) {
    return Promise.reject(CommonErrEnum.inheritPermissionError);
  }

  // 凭证校验
  const { teamId, tmbId, userId, isRoot } = parentId
    ? await authApp({ req, appId: parentId, per: WritePermissionVal, authToken: true })
    : await authUserPer({ req, authToken: true, per: TeamAppCreatePermissionVal });

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
        const myModels = new Set(
          await getMyModels({
            teamId,
            tmbId,
            isTeamOwner: isRoot || tmb?.role === 'owner'
          })
        );

        return removeUnauthModels({
          modules,
          allowedModels: myModels
        });
      }
      return [];
    })(),
    edges,
    chatConfig,
    teamId,
    tmbId,
    userAvatar: tmb?.avatar,
    username: tmb?.user?.username,
    templateId
  });

  pushTrack.createApp({
    type,
    uid: userId,
    teamId,
    tmbId,
    appId,
    ...utmParams
  });

  return appId;
}

export default NextAPI(handler);

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
  session
}: {
  parentId?: ParentIdType;
  name?: string;
  avatar?: string;
  type: AppTypeEnum;
  modules?: AppSchema['modules'];
  edges?: AppSchema['edges'];
  chatConfig?: AppSchema['chatConfig'];
  intro?: string;
  teamId: string;
  tmbId: string;
  pluginData?: AppSchema['pluginData'];
  username?: string;
  userAvatar?: string;
  templateId?: string;
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

  const create = async (session: ClientSession) => {
    const _avatar = await (async () => {
      if (!templateId) return avatar;

      const template = await MongoAppTemplate.findOne({ templateId }, 'avatar').lean();
      if (!template?.avatar) return avatar;

      const s3AvatarSource = getS3AvatarSource();
      if (!isS3ObjectKey(template.avatar?.slice(s3AvatarSource.prefix.length), 'avatar')) {
        return template.avatar;
      }

      const filename = (() => {
        const last = template.avatar.split('/').pop();
        if (!last) return getNanoid(6).concat(path.extname(template.avatar));
        const firstDashIndex = last.indexOf('-');
        return `${getNanoid(6)}-${firstDashIndex === -1 ? last : last.slice(firstDashIndex + 1)}`;
      })();

      return await s3AvatarSource.copyAvatar({
        key: template.avatar,
        teamId,
        filename,
        temporary: true
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
          modules,
          edges,
          chatConfig,
          type,
          version: 'v2',
          pluginData,
          templateId
        }
      ],
      { session, ordered: true }
    );

    const appId = app._id;

    if (!AppFolderTypeList.includes(type!)) {
      await MongoAppVersion.create(
        [
          {
            tmbId,
            appId,
            nodes: modules,
            edges,
            chatConfig,
            versionName: name,
            username,
            avatar: userAvatar,
            isPublish: true
          }
        ],
        { session, ordered: true }
      );
    }

    await MongoResourcePermission.insertOne({
      teamId,
      tmbId,
      resourceId: app._id,
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
