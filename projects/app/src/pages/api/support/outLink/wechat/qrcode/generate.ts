import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { ILinkClient } from '@fastgpt/service/support/outLink/wechat/ilinkClient';
import { authOutLinkValid } from '@fastgpt/service/support/permission/publish/authLink';
import type { WechatAppType } from '@fastgpt/global/support/outLink/type';
import { setRedisCache } from '@fastgpt/service/common/redis/cache';

async function handler(
  req: ApiRequestProps<{ shareId: string }>
): Promise<{ qrcode: string; qrcode_img_content: string; expireTime: number }> {
  const { shareId } = req.body;

  await authOutLinkValid<WechatAppType>({ shareId });

  const client = new ILinkClient();
  const qrData = await client.getQRCode();

  await setRedisCache(`publish:wechat:qrcode:${shareId}`, JSON.stringify(qrData), 480);

  return {
    qrcode: qrData.qrcode,
    qrcode_img_content: qrData.qrcode_img_content,
    expireTime: 480
  };
}

export default NextAPI(handler);
