import { NextAPI } from '@/service/middleware/entry';
import { removeTagFromApp } from '@fastgpt/service/core/app/tags/controller';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/service/type/next';

type Props = {
  appId: string;
  tagId: string;
};

async function handler(req: ApiRequestProps<Props>) {
  // 确保只处理 DELETE 请求
  if (req.method !== 'DELETE') {
    throw new Error('Method Not Allowed');
  }

  const appId = req.query.appId as string;
  const tagId = req.query.tagId as string;

  if (!appId || !tagId) {
    throw new Error('App ID and Tag ID cannot be empty');
  }

  const { teamId } = await authApp({
    req,
    authToken: true,
    appId,
    per: WritePermissionVal
  });

  return removeTagFromApp({
    appId,
    tagId,
    teamId
  });
}

export default NextAPI(handler);
