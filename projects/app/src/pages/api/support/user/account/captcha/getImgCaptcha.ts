import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import {
  GetPuzzleCaptchaQuerySchema,
  type GetPuzzleCaptchaQuery
} from '@fastgpt/global/openapi/support/user/account/captcha/api';
import { PuzzleCaptchaChallengeSchema } from '@fastgpt/global/support/user/account/captcha/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { puzzleCaptchaService } from '@fastgpt/service/support/user/account/captcha/service';
import { getPasswordLoginCaptchaScope } from '@fastgpt/service/support/user/account/login/risk/service';
import { checkIPRateLimit } from '@fastgpt/service/common/rateLimit/interface/ip';
import { getClientIpFromRequest } from '@fastgpt/service/common/security/clientIp';
import { UserError } from '@fastgpt/global/common/error/utils';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { NextAPI } from '@/service/middleware/entry';

/** 发送验证码和风险登录共用拼图生成，但验证凭证作用域严格分离。 */
export async function handler(
  req: ApiRequestProps<Record<string, never>, GetPuzzleCaptchaQuery>,
  res: ApiResponseType
) {
  res.setHeader('Cache-Control', 'no-store');
  const { username, purpose, usage } = parseApiInput({
    req,
    querySchema: GetPuzzleCaptchaQuerySchema
  }).query;
  if (
    !(await checkIPRateLimit({
      id: 'puzzle-create',
      ip: getClientIpFromRequest(req) ?? 'unknown',
      limit: 30,
      seconds: 60
    }))
  ) {
    throw new UserError(UserErrEnum.verifyCodeTooFrequently);
  }
  return PuzzleCaptchaChallengeSchema.parse(
    await puzzleCaptchaService.create({
      username,
      purpose,
      scopeKey: usage === 'passwordLogin' ? getPasswordLoginCaptchaScope(username) : username
    })
  );
}

export default NextAPI(handler);
