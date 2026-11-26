import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import {
  VerifyPuzzleCaptchaBodySchema,
  type VerifyPuzzleCaptchaBody,
  type VerifyPuzzleCaptchaResponse
} from '@fastgpt/global/openapi/support/user/account/captcha/api';
import { PuzzleCaptchaResultSchema } from '@fastgpt/global/support/user/account/captcha/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { puzzleCaptchaService } from '@fastgpt/service/support/user/account/captcha/service';
import { checkIPRateLimit } from '@fastgpt/service/common/rateLimit/interface/ip';
import { getClientIpFromRequest } from '@fastgpt/service/common/security/clientIp';
import { UserError } from '@fastgpt/global/common/error/utils';
import { UserErrEnum } from '@fastgpt/global/common/error/code/user';
import { NextAPI } from '@/service/middleware/entry';

/** 校验旋转角度和拖动轨迹；每张图最多三次，成功后即消费图片。 */
export async function handler(
  req: ApiRequestProps<VerifyPuzzleCaptchaBody>,
  res: ApiResponseType
): Promise<VerifyPuzzleCaptchaResponse> {
  res.setHeader('Cache-Control', 'no-store');
  const { body } = parseApiInput({ req, bodySchema: VerifyPuzzleCaptchaBodySchema });
  if (
    !(await checkIPRateLimit({
      id: 'puzzle-verify',
      ip: getClientIpFromRequest(req) ?? 'unknown',
      limit: 60,
      seconds: 60
    }))
  ) {
    throw new UserError(UserErrEnum.verifyCodeTooFrequently);
  }
  return PuzzleCaptchaResultSchema.parse(await puzzleCaptchaService.verify(body));
}

export default NextAPI(handler);
