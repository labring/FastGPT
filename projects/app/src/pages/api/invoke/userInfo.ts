import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import type {
  InvokeUserInfoBodyType,
  InvokeUserInfoQueryType,
  InvokeUserInfoResponseType
} from '@fastgpt/global/openapi/plugin/invoke';
import { authPluginAccessToken } from '@fastgpt/service/support/permission/auth/pluginAccessToken';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import { getOrgsByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { MongoOrgModel } from '@fastgpt/service/support/permission/org/orgSchema';
import { DefaultGroupName } from '@fastgpt/global/support/user/team/group/constant';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';

async function handler(
  req: ApiRequestProps<InvokeUserInfoBodyType, InvokeUserInfoQueryType>,
  res: ApiResponseType<InvokeUserInfoResponseType>
): Promise<InvokeUserInfoResponseType> {
  // const body = InvokeUserInfoBodySchema.parse(req.body);
  // const query = InvokeUserInfoQuerySchema.parse(req.query);

  const { tmbId, teamId } = await authPluginAccessToken({ req });

  const [user, orgs, groups] = await Promise.all([
    getUserDetail({ tmbId }),
    getOrgsByTmbId({ teamId, tmbId }),
    getGroupsByTmbId({ tmbId, teamId })
  ]);

  const team = await MongoTeam.findById(teamId, {
    name: 1
  }).lean();

  if (!team) throw new Error('Team not found');

  const orgInfos = await MongoOrgModel.find(
    {
      _id: {
        $in: orgs.map((org) => org.orgId)
      }
    },
    {
      name: 1,
      pathId: 1
    }
  ).lean();

  return {
    username: user.username,
    memberName: user.team.memberName,
    contact: user.contact,
    orgs:
      orgInfos.map((org) => ({
        name: org.name,
        pathId: org.pathId
      })) || [],
    groups:
      groups.map((group) => ({
        name: group.name === DefaultGroupName ? team?.name : group.name
      })) || []
  };
}

export default NextAPI(handler);
