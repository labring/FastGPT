// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { User } from '@/service/models/user';
import { AuthCode } from '@/service/models/authCode';
import { connectToDatabase } from '@/service/mongo';
import { UserAuthTypeEnum } from '@/constants/common';
import { setCookie } from '@/service/utils/tools';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { username, code, password } = req.body;

    if (!username || !code || !password) {
      throw new Error('缺少参数');
    }

    await connectToDatabase();

    // 验证码校验
    const authCode = await AuthCode.findOne({
      username,
      code,
      type: UserAuthTypeEnum.findPassword,
      expiredTime: { $gte: Date.now() }
    });

    if (!authCode) {
      throw new Error('验证码错误');
    }

    // 更新对应的记录
    await User.updateOne(
      {
        username
      },
      {
        password
      }
    );

    // 根据 username 获取用户信息
    const user = await User.findOne({
      username
    });

    if (!user) {
      throw new Error('获取用户信息异常');
    }

    setCookie(res, user._id);

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
