import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { UpdateTeamProps } from '@fastgpt/global/support/user/team/controller';
import { authTeamOwner } from '@fastgpt/service/support/permission/auth/user';
import { updateTeam } from '@fastgpt/service/support/user/team/controller';

export type updateQuery = {};

export type updateBody = {};

export type updateResponse = {};

async function handler(req: ApiRequestProps<updateBody, updateQuery>, res: ApiResponseType<any>) {
  const body = req.body as UpdateTeamProps;

  const { teamId } = await authTeamOwner({ req, authToken: true });

  await updateTeam({ teamId, ...body });
}

export default NextAPI(handler);
