import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import {
  LoginVerificationVerifyBodySchema,
  LoginSuccessResponseSchema,
  type LoginVerificationVerifyBodyType,
  type LoginSuccessResponseType
} from '@fastgpt/global/openapi/support/user/account/login/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { NextAPI } from '@/service/middleware/entry';
import {
  completePasswordLogin,
  finishPasswordLogin,
  getPasswordLoginUser
} from '@fastgpt/service/support/user/account/login/service';
import { consumeLoginVerification } from '@fastgpt/service/support/user/account/login/verification/service';
import { UserError } from '@fastgpt/global/common/error/utils';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';

async function handler(
  req: ApiRequestProps<LoginVerificationVerifyBodyType>,
  res: ApiResponseType
): Promise<LoginSuccessResponseType> {
  const body = parseApiInput({
    req,
    bodySchema: LoginVerificationVerifyBodySchema
  }).body;

  const loginResult = await consumeLoginVerification(body, async ({ challenge, session }) => {
    const user = await getPasswordLoginUser({
      userId: challenge.userId,
      session
    });

    // Challenge 是服务端登录上下文；用户被删除、串用或数据不一致时不得继续登录。
    if (String(user._id) !== challenge.userId || user.username !== challenge.username) {
      throw new UserError(UserErrEnum.invalidVerificationCode);
    }

    return {
      ...(await completePasswordLogin({
        user,
        username: challenge.username,
        language: challenge.language,
        fastgpt_sem: challenge.fastgpt_sem,
        session
      })),
      username: challenge.username
    };
  });

  return LoginSuccessResponseSchema.parse(
    await finishPasswordLogin({
      ...loginResult,
      req,
      res
    })
  );
}

export default NextAPI(handler);
