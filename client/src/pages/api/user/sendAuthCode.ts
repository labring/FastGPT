import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { UserAuthTypeEnum } from '@/constants/common';
import { authGoogleToken } from '@/utils/plugin/google';
import requestIp from 'request-ip';
import { sendCode } from '@/service/api/plugins';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { username, type, googleToken } = req.body as {
      username: string;
      type: `${UserAuthTypeEnum}`;
      googleToken: string;
    };

    if (!username || !type) {
      throw new Error('缺少参数');
    }

    // google auth
    global.systemEnv.googleServiceVerKey &&
      (await authGoogleToken({
        secret: global.systemEnv.googleServiceVerKey,
        response: googleToken,
        remoteip: requestIp.getClientIp(req) || undefined
      }));

    // register switch
    if (type === UserAuthTypeEnum.register && !global.feConfigs?.show_register) {
      throw new Error('Register is closed');
    }

    await sendCode({
      username,
      type
    });

    jsonRes(res, {
      message: '发送验证码成功'
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
