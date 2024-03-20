import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { connectToDatabase } from '@/service/mongo';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { username, password } = req.body as { username: string; password: string };

    if (!username || !password) {
      throw new Error('缺少参数');
    }

    // 检测用户是否存在
    const user = await MongoUser.findOne(
      {
        username
      },
      'status'
    );

    if (!user) {
      throw new Error('该用户不存在');
    }

    // 更新对应的记录
    await MongoUser.findByIdAndUpdate(user._id, {
      password: password
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
