// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { User } from '@/service/models/user';
import { connectToDatabase } from '@/service/mongo';
import { generateToken, setCookie } from '@/service/utils/tools';
import { UserAuthTypeEnum } from '@/constants/common';
import { authCode } from '@/service/api/plugins';
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { username, code, password, inviterId } = req.body;

    if (!username || !code || !password) {
      throw new Error(t('缺少参数'));
    }

    await connectToDatabase();

    // 验证码校验
    await authCode({
      username,
      type: UserAuthTypeEnum.register,
      code
    });

    // 重名校验
    const authRepeat = await User.findOne({
      username
    });

    if (authRepeat) {
      throw new Error(t('该用户已被注册'));
    }

    const response = await User.create({
      username,
      password,
      inviterId: inviterId ? inviterId : undefined
    });

    // 根据 id 获取用户信息
    const user = await User.findById(response._id);

    if (!user) {
      throw new Error(t('获取用户信息异常'));
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
