import { NextAPI } from '@/service/middleware/entry';
import { createTag } from '@fastgpt/service/core/app/tags/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/service/type/next';

type Props = {
  name: string;
  color?: string;
};

async function handler(req: ApiRequestProps<Props>) {
  // 确保只处理 POST 请求
  if (req.method !== 'POST') {
    throw new Error('Method Not Allowed');
  }

  const { name, color } = req.body;

  if (!name) {
    throw new Error('Tag name is required');
  }

  const { teamId } = await authUserPer({
    req,
    authToken: true,
    per: WritePermissionVal
  });

  return createTag({
    teamId,
    name,
    color
  });
}

export default NextAPI(handler);
