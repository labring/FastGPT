import { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { jsonRes } from '@fastgpt/service/common/response';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { InviteMemberProps } from '@fastgpt/global/support/user/team/controller';
import { authUserExist } from '@fastgpt/service/support/user/controller';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import {
  InviteResponseType,
  InviteTeamMemberItemType
} from '@fastgpt/global/support/user/team/type';
import { findMatchTeamMember } from '@fastgpt/service/support/user/team/controller';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    let inValid: InviteResponseType[] = [];
    const { role, teamId, usernames } = req.body as InviteMemberProps;
    const { userId } = await authCert({ req, authToken: true });
    const documents: Promise<InviteTeamMemberItemType>[] = usernames.map(async (name) => {
      const user = await authUserExist({ username: name });
      if (!user) {
        inValid.push({
          userId: '',
          username: name
        });
      }
      return {
        role,
        teamId,
        name,
        userId: user?._id,
        username: name,
        status: TeamMemberStatusEnum.active,
        createTime: new Date(),
        defaultTeam: true
      };
    });

    const result = await Promise.all(documents).then(async (data) => {
      return await findMatchTeamMember(data, teamId, userId);
    });

    if (result.invite.length) {
      await MongoTeamMember.insertMany(result.invite);
    }

    jsonRes(res, {
      data: {
        inValid,
        ...result
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
