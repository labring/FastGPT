import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import {
  LoginVerificationSendCodeBodySchema,
  LoginVerificationSendCodeResponseSchema,
  type LoginVerificationSendCodeBodyType,
  type LoginVerificationSendCodeResponseType
} from '@fastgpt/global/openapi/support/user/account/login/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { sendLoginVerificationCode } from '@fastgpt/service/support/user/account/login/verification/service';
import { NextAPI } from '@/service/middleware/entry';

async function handler(
  req: ApiRequestProps<LoginVerificationSendCodeBodyType>,
  _res: ApiResponseType
): Promise<LoginVerificationSendCodeResponseType> {
  const { body } = parseApiInput({
    req,
    bodySchema: LoginVerificationSendCodeBodySchema
  });

  return LoginVerificationSendCodeResponseSchema.parse(await sendLoginVerificationCode(body));
}

export default NextAPI(handler);
