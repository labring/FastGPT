// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { User } from '@/service/models/user';
import { generateToken, setCookie } from '@/service/utils/tools';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      throw new Error('缺少参数');
    }

    await connectToDatabase();

    // 检测用户是否存在
    const authUser = await User.findOne({
      username
    });
    if (!authUser) {
      throw new Error('用户未注册');
    }

    const user = await User.findOne({
      username,
      password
    });

    if (!user) {
      throw new Error('密码错误');
    }

    const token = generateToken(user._id);
    setCookie(res, token);

    jsonRes(res, {
      data: {
        user,
        token
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
