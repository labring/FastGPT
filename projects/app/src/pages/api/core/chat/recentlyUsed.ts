import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoAppRecord } from '@fastgpt/service/core/app/record/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import type { GetRecentlyUsedAppsResponseType } from '@fastgpt/global/openapi/core/chat/api';
import { jsonRes } from '@fastgpt/service/common/response';

async function handler(
  req: ApiRequestProps<Record<string, never>, Record<string, never>>,
  res: ApiResponseType
): Promise<GetRecentlyUsedAppsResponseType | void> {
  if (req.method !== 'GET' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'GET, DELETE');
    return jsonRes(res, { code: 405, error: 'Method not allowed' });
  }

  const { tmbId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true
  });

  if (req.method === 'DELETE') {
    // 仅清除当前成员的应用使用记录，保留应用及其对话历史。
    await MongoAppRecord.deleteMany({ tmbId });
    return;
  }

  const recentRecords = await MongoAppRecord.find(
    { tmbId },
    { appId: 1 },
    { sort: { lastUsedTime: -1 }, limit: 20 }
  ).lean();

  if (!recentRecords.length) return [];

  const apps = await MongoApp.find(
    { _id: { $in: recentRecords.map((record) => record.appId) } },
    '_id name avatar'
  ).lean();

  const appMap = new Map(apps.map((app) => [String(app._id), app]));

  return recentRecords
    .map((record) => appMap.get(String(record.appId)))
    .filter((app) => app != null)
    .map((app) => ({
      appId: String(app._id),
      name: app.name,
      avatar: app.avatar ?? ''
    }));
}

export default NextAPI(handler);
