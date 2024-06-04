import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { UpdateTeamProps } from '@fastgpt/global/support/user/team/controller';
import { authUserPer } from '@fastgpt/service/support/permission/auth/user';
import { updateTeam } from '@fastgpt/service/support/user/team/controller';
import { AdminPermissionVal } from '@fastgpt/global/support/permission/constant';

export type updateQuery = {};

export type updateBody = {};

export type updateResponse = {};

async function handler(req: ApiRequestProps<updateBody, updateQuery>, res: ApiResponseType<any>) {
  const body = req.body as UpdateTeamProps;

  const { teamId } = await authUserPer({ req, authToken: true, per: AdminPermissionVal });

  await updateTeam({ teamId, ...body });
}

export default NextAPI(handler);
