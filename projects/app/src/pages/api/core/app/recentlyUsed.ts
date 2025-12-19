import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoAppUsage } from '@fastgpt/service/core/app/usage/schema';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import type { AppListItemType } from '@fastgpt/global/core/app/type';

export type GetRecentlyUsedAppsResponse = AppListItemType[];

async function handler(
  req: ApiRequestProps<{}, {}>,
  _res: ApiResponseType<GetRecentlyUsedAppsResponse>
): Promise<GetRecentlyUsedAppsResponse> {
  const { tmbId, teamId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true
  });

  const recentUsages = await MongoAppUsage.find(
    { tmbId },
    { appId: 1 },
    { sort: { lastUsedTime: -1 }, limit: 20 }
  ).lean();

  if (!recentUsages.length) return [];

  const appIds = recentUsages.map((usage) => usage.appId);

  // 并发检查权限
  const results = await Promise.allSettled(
    appIds.map((appId) =>
      authApp({ req, authToken: true, authApiKey: true, appId, per: ReadPermissionVal })
        .then(({ app }) => ({ appId, app }))
        .catch(() => ({ appId, app: null }))
    )
  );

  const validApps: {
    appId: string;
    app: NonNullable<Awaited<ReturnType<typeof authApp>>['app']>;
  }[] = [];
  const invalidAppIds: string[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { appId, app } = result.value;
      if (app) {
        validApps.push({ appId, app });
      } else {
        invalidAppIds.push(appId);
      }
    }
  }

  // 异步清理无效记录
  if (invalidAppIds.length) {
    MongoAppUsage.deleteMany({ tmbId, teamId, appId: { $in: invalidAppIds } }).catch((err) =>
      console.error('Failed to clean invalid app usage records:', err)
    );
  }

  return addSourceMember({
    list: validApps.map(({ app }) => ({
      _id: app._id,
      parentId: app.parentId,
      tmbId: app.tmbId,
      name: app.name,
      avatar: app.avatar,
      intro: app.intro,
      type: app.type,
      updateTime: app.updateTime,
      pluginData: app.pluginData,
      permission: app.permission,
      inheritPermission: app.inheritPermission
    }))
  });
}

export default NextAPI(handler);
