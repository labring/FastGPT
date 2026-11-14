import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import {
  GetImgCaptchaQuerySchema,
  type GetImgCaptchaQuery
} from '@fastgpt/global/openapi/support/user/account/captcha/api';
import { PuzzleCaptchaChallengeSchema } from '@fastgpt/global/support/user/account/captcha/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { puzzleCaptchaService } from '@fastgpt/service/support/user/account/captcha/service';
import { checkIPRateLimit } from '@fastgpt/service/common/rateLimit/interface/ip';
import { getClientIpFromRequest } from '@fastgpt/service/common/security/clientIp';
import { UserError } from '@fastgpt/global/common/error/utils';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { NextAPI } from '@/service/middleware/entry';

/** 为已有验证码业务生成旋转图片，验证材料绑定账号和业务用途。 */
export async function handler(
  req: ApiRequestProps<Record<string, never>, GetImgCaptchaQuery>,
  res: ApiResponseType
) {
  res.setHeader('Cache-Control', 'no-store');
  const { username, purpose } = parseApiInput({
    req,
    querySchema: GetImgCaptchaQuerySchema
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
      purpose
    })
  );
}

export default NextAPI(handler);
