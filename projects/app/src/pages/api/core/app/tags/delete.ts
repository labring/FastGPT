import { NextAPI } from '@/service/middleware/entry';
import { deleteTag } from '@fastgpt/service/core/app/tags/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/service/type/next';

type Props = {
  tagId: string;
};

async function handler(req: ApiRequestProps<Props>) {
  // 确保只处理 DELETE 请求
  if (req.method !== 'DELETE') {
    throw new Error('Method Not Allowed');
  }

  const tagId = req.query.tagId as string;

  if (!tagId) {
    throw new Error('Tag ID cannot be empty');
  }

  const { teamId } = await authUserPer({
    req,
    authToken: true,
    per: WritePermissionVal
  });

  return deleteTag({
    tagId,
    teamId
  });
}

export default NextAPI(handler);
