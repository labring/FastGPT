import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import {
  LoginVerificationChallengeBodySchema,
  LoginVerificationCaptchaResponseSchema,
  type LoginVerificationChallengeBodyType,
  type LoginVerificationCaptchaResponseType
} from '@fastgpt/global/openapi/support/user/account/login/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { createLoginVerificationCaptcha } from '@fastgpt/service/support/user/account/login/verification/service';
import { NextAPI } from '@/service/middleware/entry';

async function handler(
  req: ApiRequestProps<LoginVerificationChallengeBodyType>,
  _res: ApiResponseType
): Promise<LoginVerificationCaptchaResponseType> {
  const { body } = parseApiInput({
    req,
    bodySchema: LoginVerificationChallengeBodySchema
  });

  return LoginVerificationCaptchaResponseSchema.parse(await createLoginVerificationCaptcha(body));
}

export default NextAPI(handler);
