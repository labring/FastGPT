import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { connectToDatabase } from '@/service/mongo';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { oldPsw, newPsw } = req.body as { oldPsw: string; newPsw: string };

    if (!oldPsw || !newPsw) {
      throw new Error('Params is missing');
    }

    const { tmbId } = await authCert({ req, authToken: true });
    const tmb = await MongoTeamMember.findById(tmbId);
    if (!tmb) {
      throw new Error('can not find it');
    }
    const userId = tmb.userId;
    // auth old password
    const user = await MongoUser.findOne({
      _id: userId,
      password: oldPsw
    });

    if (!user) {
      throw new Error('user.Old password is error');
    }

    // 更新对应的记录
    await MongoUser.findByIdAndUpdate(userId, {
      password: newPsw
    });

    jsonRes(res, {
      data: {
        user
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
