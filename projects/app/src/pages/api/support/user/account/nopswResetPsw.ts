import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoUser } from '@fastgpt/service/support/user/schema';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await authCert({ req, authToken: true });
    const userId = req.body.userId;
    const newPsw = req.body.newPsw;
    // auth old password
    const user = await MongoUser.findOne({
      _id: userId
    });

    if (!user) {
      throw new Error('can not find it');
    }

    if (user.passwordUpdateTime) {
      throw new Error('no right to reset password');
    }

    console.log('user', user);

    // 更新对应的记录
    await MongoUser.findByIdAndUpdate(userId, {
      password: newPsw,
      passwordUpdateTime: new Date()
    });

    console.log('user', user);

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
