import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { generateWechatQrCode } from '@fastgpt/service/support/outLink/wechat/service';
import { authOutLinkCrud } from '@fastgpt/service/support/permission/publish/authLink';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  WechatQrcodeGenerateBodySchema,
  WechatQrcodeGenerateResponseSchema,
  type WechatQrcodeGenerateBodyType,
  type WechatQrcodeGenerateResponseType
} from '@fastgpt/global/openapi/support/outLink/provider/wechat';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { assertWechatOutLink } from '@fastgpt/service/support/outLink/wechat/utils';

async function handler(
  req: ApiRequestProps<WechatQrcodeGenerateBodyType>
): Promise<WechatQrcodeGenerateResponseType> {
  const { outLinkId } = parseApiInput({
    req,
    bodySchema: WechatQrcodeGenerateBodySchema
  }).body;

  const { tmbId, outLink } = await authOutLinkCrud({
    req,
    authToken: true,
    outLinkId,
    per: ManagePermissionVal
  });
  await assertWechatOutLink(outLink);

  return WechatQrcodeGenerateResponseSchema.parse(await generateWechatQrCode({ outLinkId, tmbId }));
}

export default NextAPI(handler);
