// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { User } from '@/service/models/user';
import { AuthCode } from '@/service/models/authCode';
import { connectToDatabase } from '@/service/mongo';
import { generateToken } from '@/service/utils/tools';
import { UserAuthTypeEnum } from '@/constants/common';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { phone, code, password, inviterId } = req.body;

    if (!phone || !code || !password) {
      throw new Error('缺少参数');
    }

    const reg = /^1[3456789]\d{9}$/;

    if (!reg.test(phone)) {
      throw new Error('手机号格式错误');
    }

    await connectToDatabase();

    // 验证码校验. 注册只接收手机号
    const authCode = await AuthCode.findOne({
      username: phone,
      code,
      type: UserAuthTypeEnum.register,
      expiredTime: { $gte: Date.now() }
    });

    if (!authCode) {
      throw new Error('验证码错误');
    }

    // 重名校验
    const authRepeat = await User.findOne({
      username: phone
    });

    if (authRepeat) {
      throw new Error('手机号已被注册');
    }

    const response = await User.create({
      username: phone,
      password,
      inviterId: inviterId ? inviterId : undefined
    });

    // 根据 id 获取用户信息
    const user = await User.findById(response._id);

    if (!user) {
      throw new Error('获取用户信息异常');
    }

    // 删除验证码记录
    await AuthCode.deleteMany({
      username: phone
    });

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
