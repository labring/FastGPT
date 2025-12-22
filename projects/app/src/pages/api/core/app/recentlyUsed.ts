import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoAppRecord } from '@fastgpt/service/core/app/record/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import type { AppListItemType } from '@fastgpt/global/core/app/type';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';

export type GetRecentlyUsedAppsResponse = AppListItemType[];

async function handler(
  req: ApiRequestProps<{}, {}>,
  _res: ApiResponseType<GetRecentlyUsedAppsResponse>
): Promise<GetRecentlyUsedAppsResponse> {
  const { tmbId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true
  });

  const recentRecords = await MongoAppRecord.find(
    { tmbId },
    { appId: 1 },
    { sort: { lastUsedTime: -1 }, limit: 20 }
  ).lean();

  if (!recentRecords.length) return [];

  const appIds = recentRecords.map((record) => record.appId);

  const apps = await MongoApp.find(
    {
      _id: { $in: appIds },
      deleteTime: null
    },
    '_id parentId tmbId name avatar intro type updateTime pluginData inheritPermission'
  ).lean();

  const appMap = new Map(apps.map((app) => [String(app._id), app]));
  const sortedApps = recentRecords
    .map((record) => appMap.get(String(record.appId)))
    .filter((app) => app != null);

  return addSourceMember({
    list: sortedApps.map((app) => ({
      _id: app._id,
      parentId: app.parentId,
      tmbId: app.tmbId,
      name: app.name,
      avatar: app.avatar,
      intro: app.intro,
      type: app.type,
      updateTime: app.updateTime,
      pluginData: app.pluginData,
      permission: new AppPermission({
        role: 0,
        isOwner: String(app.tmbId) === String(tmbId)
      }),
      inheritPermission: app.inheritPermission
    }))
  });
}

export default NextAPI(handler);
