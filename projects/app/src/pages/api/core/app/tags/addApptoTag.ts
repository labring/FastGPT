import { NextAPI } from '@/service/middleware/entry';
import { batchAddAppsToTag } from '@fastgpt/service/core/app/tags/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/service/type/next';

type Props = {
  tagId: string;
  appIds: string[];
};

async function handler(req: ApiRequestProps<Props>) {
  // 确保只处理 POST 请求
  if (req.method !== 'POST') {
    throw new Error('Method Not Allowed');
  }

  const { tagId, appIds } = req.body;

  if (!tagId) {
    throw new Error('tagId is required');
  }

  if (!appIds || !Array.isArray(appIds)) {
    throw new Error('appIds must be an array');
  }

  const { teamId } = await authUserPer({
    req,
    authToken: true,
    per: WritePermissionVal
  });

  await batchAddAppsToTag({
    tagId,
    appIds,
    teamId
  });

  return { success: true };
}

export default NextAPI(handler);
