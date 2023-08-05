// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { User } from '@/service/models/user';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { oldPsw, newPsw } = req.body as { oldPsw: string; newPsw: string };

    if (!oldPsw || !newPsw) {
      throw new Error('Params is missing');
    }

    await connectToDatabase();

    const { userId } = await authUser({ req, authToken: true });

    // auth old password
    const user = await User.findOne({
      _id: userId,
      password: oldPsw
    });

    if (!user) {
      throw new Error('user.Old password is error');
    }

    // 更新对应的记录
    await User.findByIdAndUpdate(userId, {
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
