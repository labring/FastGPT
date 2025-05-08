import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { NextAPI } from '@/service/middleware/entry';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { checkPsw } from '@/service/support/user/account/check';

export type nopswResetPswQuery = {
  userId: string;
  newPsw: string;
};

export type nopswResetPswBody = {
  userId: string;
  newPsw: string;
};

export type nopswResetPswResponse = {};

async function nopswResetPswHandler(
  req: ApiRequestProps<nopswResetPswBody, nopswResetPswQuery>,
  res: ApiResponseType<nopswResetPswResponse>
): Promise<nopswResetPswResponse> {
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

    // check if can reset password
    const canReset = checkPsw({ updateTime: user.passwordUpdateTime });

    if (!canReset) {
      throw new Error(i18nT('common:user.No_right_to_reset_password'));
    }

    // 更新对应的记录
    await MongoUser.findByIdAndUpdate(userId, {
      password: newPsw,
      passwordUpdateTime: new Date()
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
  return {};
}

export default NextAPI(nopswResetPswHandler);
