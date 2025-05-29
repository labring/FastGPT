import { NextAPI } from '@/service/middleware/entry';
import { getTeamTags, getTagsWithCount } from '@fastgpt/service/core/app/tags/controller';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { TeamReadPermissionVal } from '@fastgpt/global/support/permission/user/constant';

type Props = {
  withCount?: boolean;
};

async function handler(req: ApiRequestProps<Props>) {
  // 确保只处理 GET 请求
  if (req.method !== 'GET') {
    throw new Error('Method Not Allowed');
  }

  const withCount = req.query?.withCount === 'true';

  const { teamId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: TeamReadPermissionVal
  });

  if (withCount) {
    return getTagsWithCount(teamId);
  }

  return getTeamTags(teamId);
}

export default NextAPI(handler);
