import type {
  AppResourceType,
  AppSchemaType,
  ReferencedAppsResponse
} from '@fastgpt/global/core/app/type';
import { ReferencedAppsResponseSchema } from '@fastgpt/global/core/app/type';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { findResourceKeysByCollaboratorsPermission } from '@fastgpt/service/support/permission/resourcePermissionService';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import { findTeamAppsByPublishedResource } from '@fastgpt/service/core/app/resourceLookup';

type PublishedApp = Pick<
  AppSchemaType,
  '_id' | 'avatar' | 'type' | 'name' | 'intro' | 'tmbId' | 'updateTime'
>;

export type ListReadableReferencedAppsParams = {
  teamId: string;
  tmbId: string;
  isTeamOwner: boolean;
  resourceType: AppResourceType;
  resourceIds: string | string[];
};

/**
 * 按当前用户的 App 读取权限过滤引用结果。
 * hiddenCount 统计无权读取的 App，list 仅包含请求者可读取的 App。
 */
export const formatReadableReferencedApps = async ({
  apps,
  teamId,
  tmbId,
  isTeamOwner
}: {
  apps: PublishedApp[];
  teamId: string;
  tmbId: string;
  isTeamOwner: boolean;
}): Promise<ReferencedAppsResponse> => {
  const readableAppIds = await (async () => {
    if (isTeamOwner) return;

    const [groupIds, orgIds] = await Promise.all([
      getGroupsByTmbId({ tmbId, teamId }).then((items) => items.map((item) => String(item._id))),
      getOrgIdSetWithParentByTmbId({ teamId, tmbId }).then((ids) => Array.from(ids))
    ]);

    return new Set(
      await findResourceKeysByCollaboratorsPermission({
        resourceType: PerResourceTypeEnum.app,
        teamId,
        tmbId,
        groupIds,
        orgIds,
        permission: ReadPermissionVal,
        matchLogic: 'or',
        personalPermissionPriority: true
      })
    );
  })();

  const readableApps = apps.filter(
    (app) =>
      isTeamOwner || String(app.tmbId) === String(tmbId) || readableAppIds?.has(String(app._id))
  );
  // 按更新时间倒序保留最新 100 条，避免 Popover 一次加载过多数据。
  const formattedApps = readableApps.slice(0, 100).map((app) => ({
    _id: String(app._id),
    name: app.name,
    avatar: app.avatar ?? '',
    intro: app.intro ?? '',
    tmbId: String(app.tmbId),
    type: app.type,
    updateTime: app.updateTime
  }));

  return {
    list: await addSourceMember({ list: formattedApps }),
    hiddenCount: apps.length - readableApps.length
  };
};

/**
 * 查询指定资源当前正式版本的引用应用，按更新时间排序并应用请求者的 App 读取权限。
 */
export const listReadableReferencedApps = async ({
  teamId,
  tmbId,
  isTeamOwner,
  resourceType,
  resourceIds
}: ListReadableReferencedAppsParams): Promise<ReferencedAppsResponse> => {
  const { apps } = await findTeamAppsByPublishedResource({
    teamId,
    type: resourceType,
    ids: resourceIds
  });
  apps.sort((a, b) => +new Date(b.updateTime) - +new Date(a.updateTime));

  return ReferencedAppsResponseSchema.parse(
    await formatReadableReferencedApps({ apps, teamId, tmbId, isTeamOwner })
  );
};
