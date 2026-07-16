import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { ILinkClient } from '@fastgpt/service/support/outLink/wechat/ilinkClient';
import { authOutLinkCrud } from '@fastgpt/service/support/permission/publish/authLink';
import { setRedisCache } from '@fastgpt/service/common/redis/cache';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  WechatQrcodeGenerateBodySchema,
  WechatQrcodeGenerateResponseSchema,
  type WechatQrcodeGenerateBodyType,
  type WechatQrcodeGenerateResponseType
} from '@fastgpt/global/openapi/support/outLink/api';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { getWechatQrcodeCacheKey } from '@fastgpt/service/support/outLink/wechat/qrcode';
import { assertWechatOutLink } from '@fastgpt/service/support/outLink/wechat/utils';

const EXPIRE_TIME = 480;

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

  await setRedisCache(
    getWechatQrcodeCacheKey({ outLinkId, tmbId }),
    JSON.stringify(qrData),
    EXPIRE_TIME
  );

  return WechatQrcodeGenerateResponseSchema.parse({
    qrcode: qrData.qrcode,
    qrcode_img_content: qrData.qrcode_img_content,
    expireTime: EXPIRE_TIME
  });
}

export default NextAPI(handler);
