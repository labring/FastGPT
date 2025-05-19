import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { GET } from '@fastgpt/service/common/api/plusRequest';
import {
  AuthTeamTagTokenProps,
  AuthTokenFromTeamDomainResponse
} from '@fastgpt/global/support/user/team/tag';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';

export function authTeamTagToken(data: AuthTeamTagTokenProps) {
  return GET<AuthTokenFromTeamDomainResponse['data']>('/support/user/team/tag/authTeamToken', data);
}
export async function authTeamSpaceToken({
  teamId,
  teamToken
}: {
  teamId: string;
  teamToken: string;
}) {
  // get outLink and app
  const [{ uid }, member] = await Promise.all([
    authTeamTagToken({ teamId, teamToken }),
    MongoTeamMember.findOne({ teamId, role: TeamMemberRoleEnum.owner }, 'tmbId').lean()
  ]);

  return {
    uid,
    tmbId: member?._id!
  };
}
