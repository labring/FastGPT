import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { UpdateTeamBodySchema } from '@fastgpt/global/openapi/support/user/team/api';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { updateTeam } from '@fastgpt/service/support/user/team/controller';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(req: ApiRequestProps): Promise<void> {
  const { body } = parseApiInput({ req, bodySchema: UpdateTeamBodySchema });

  const { teamId } = await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  await updateTeam({ teamId, ...body });
}

export default NextAPI(handler);
