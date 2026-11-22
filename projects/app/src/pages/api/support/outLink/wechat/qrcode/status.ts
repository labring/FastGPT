import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { getWechatQrStatus } from '@fastgpt/service/support/outLink/wechat/service';
import { authOutLinkCrud } from '@fastgpt/service/support/permission/publish/authLink';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  WechatQrcodeStatusQuerySchema,
  WechatQrcodeStatusResponseSchema,
  type WechatQrcodeStatusQueryType,
  type WechatQrcodeStatusResponseType
} from '@fastgpt/global/openapi/support/outLink/provider/wechat';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { assertWechatOutLink } from '@fastgpt/service/support/outLink/wechat/utils';

async function handler(
  req: ApiRequestProps<Record<string, never>, WechatQrcodeStatusQueryType>,
  res: ApiResponseType
): Promise<WechatQrcodeStatusResponseType> {
  res.setHeader('Cache-Control', 'no-store');

  const { outLinkId, attemptId } = parseApiInput({
    req,
    querySchema: WechatQrcodeStatusQuerySchema
  }).query;

  const { tmbId, outLink } = await authOutLinkCrud({
    req,
    authToken: true,
    outLinkId,
    per: ManagePermissionVal
  });
  await assertWechatOutLink(outLink);

  const status = await getWechatQrStatus({ outLink, tmbId, requestedAttemptId: attemptId });
  return WechatQrcodeStatusResponseSchema.parse({ status });
}

export default NextAPI(handler);
