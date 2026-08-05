import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { ILinkClient } from '@fastgpt/service/support/outLink/wechat/ilinkClient';
import { authOutLinkCrud } from '@fastgpt/service/support/permission/publish/authLink';
import { WECHAT_QR_LOGIN_TTL_SECONDS, wechatQrLoginCache } from '@fastgpt/dal/redis/caches';
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

  const client = new ILinkClient();
  const qrData = await client.getQRCode();

  await wechatQrLoginCache.set({ outLinkId, tmbId, data: qrData });

  return WechatQrcodeGenerateResponseSchema.parse({
    qrcode: qrData.qrcode,
    qrcode_img_content: qrData.qrcode_img_content,
    expireTime: WECHAT_QR_LOGIN_TTL_SECONDS
  });
}

export default NextAPI(handler);
