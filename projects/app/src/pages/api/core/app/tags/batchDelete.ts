import { NextAPI } from '@/service/middleware/entry';
import { batchDeleteTags } from '@fastgpt/service/core/app/tags/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { type ApiRequestProps } from '@fastgpt/service/type/next';

type Props = {
  tagIds: string[];
};

async function handler(req: ApiRequestProps<Props>) {
  // 确保只处理 DELETE 请求
  if (req.method !== 'DELETE') {
    throw new Error('Method Not Allowed');
  }

  const { tagIds } = req.body;

  if (!tagIds || !Array.isArray(tagIds) || tagIds.length === 0) {
    throw new Error('Tag IDs must be a non-empty array');
  }

  const { teamId } = await authUserPer({
    req,
    authToken: true,
    per: WritePermissionVal
  });

  return batchDeleteTags({
    tagIds,

    teamId
  });
}

export default NextAPI(handler);
