import { NextAPI } from '@/service/middleware/entry';
import { updateTag } from '@fastgpt/service/core/app/tags/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/service/type/next';

type Props = {
  tagId: string;
  name?: string;
  color?: string;
};

async function handler(req: ApiRequestProps<Props>) {
  // 确保只处理 PUT 请求
  if (req.method !== 'PUT') {
    throw new Error('Method Not Allowed');
  }

  const { tagId, name, color } = req.body;

  if (!tagId) {
    throw new Error('Tag ID cannot be empty');
  }

  const { teamId } = await authUserPer({
    req,
    authToken: true,
    per: WritePermissionVal
  });

  return updateTag({
    tagId,
    teamId,
    name,
    color
  });
}

export default NextAPI(handler);
