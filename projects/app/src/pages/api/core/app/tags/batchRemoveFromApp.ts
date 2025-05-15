import { NextAPI } from '@/service/middleware/entry';
import { batchRemoveTagsFromApp } from '@fastgpt/service/core/app/tags/controller';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/service/type/next';

type Props = {
  appId: string;
  tagIds: string[];
};

async function handler(req: ApiRequestProps<Props>) {
  // 确保只处理 DELETE 请求
  if (req.method !== 'DELETE') {
    throw new Error('Method Not Allowed');
  }

  const { appId, tagIds } = req.body;

  if (!appId) {
    throw new Error('App ID cannot be empty');
  }

  if (!tagIds || !Array.isArray(tagIds) || tagIds.length === 0) {
    throw new Error('Tag IDs must be a non-empty array');
  }

  const { teamId } = await authApp({
    req,
    authToken: true,
    appId,
    per: WritePermissionVal
  });

  return batchRemoveTagsFromApp({
    appId,
    tagIds,
    teamId
  });
}

export default NextAPI(handler);
