import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import {
  UpdateTeamBodySchema,
  UpdateTeamResponseSchema,
  type UpdateTeamResponseType
} from '@fastgpt/global/openapi/support/user/team/api';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { updateTeam } from '@fastgpt/service/support/user/team/controller';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(req: ApiRequestProps): Promise<UpdateTeamResponseType> {
  const body = UpdateTeamBodySchema.parse(req.body);

  const { teamId } = await authUserPer({ req, authToken: true, per: ManagePermissionVal });

  await updateTeam({ teamId, ...body });

  return UpdateTeamResponseSchema.parse({});
}

export default NextAPI(handler);
