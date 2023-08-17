// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { User } from '@/service/models/user';
import { connectToDatabase } from '@/service/mongo';
import { UserAuthTypeEnum } from '@/constants/common';
import { generateToken, setCookie } from '@/service/utils/tools';
import { authCode } from '@/service/api/plugins';
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { username, code, password } = req.body;

    if (!username || !code || !password) {
      throw new Error(t('缺少参数'));
    }

    await connectToDatabase();

    // 验证码校验
    await authCode({
      username,
      code,
      type: UserAuthTypeEnum.findPassword
    });

    if (!authCode) {
      throw new Error(t('验证码错误'));
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
