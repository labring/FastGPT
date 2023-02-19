// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { User } from '@/service/models/user';
import { generateToken } from '@/service/utils/tools';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new Error('缺少参数');
    }

    await connectToDatabase();

    // 检测邮箱是否存在
    const authEmail = await User.findOne({
      email
    });
    if (!authEmail) {
      throw new Error('邮箱未注册');
    }

    const user = await User.findOne({
      email,
      password
    });

    if (!user) {
      throw new Error('密码错误');
    }

    jsonRes(res, {
      data: {
        token: generateToken(user._id),
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
