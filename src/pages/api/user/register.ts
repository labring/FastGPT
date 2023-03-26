// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { User } from '@/service/models/user';
import { AuthCode } from '@/service/models/authCode';
import { connectToDatabase } from '@/service/mongo';
import { generateToken } from '@/service/utils/tools';
import { EmailTypeEnum } from '@/constants/common';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { email, code, password } = req.body;

    if (!email || !code || !password) {
      throw new Error('缺少参数');
    }

    await connectToDatabase();

    // 验证码校验
    const authCode = await AuthCode.findOne({
      email,
      code,
      type: EmailTypeEnum.register,
      expiredTime: { $gte: Date.now() }
    });

    if (!authCode) {
      throw new Error('验证码错误');
    }

    // 重名校验
    const authRepeat = await User.findOne({
      email
    });

    if (authRepeat) {
      throw new Error('邮箱已被注册');
    }

    const response = await User.create({
      email,
      password
    });

    // 根据 id 获取用户信息
    const user = await User.findById(response._id);

    if (!user) {
      throw new Error('获取用户信息异常');
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
