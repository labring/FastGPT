import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { ILinkClient } from '@fastgpt/service/support/outLink/wechat/ilinkClient';
import { getRedisCache, delRedisCache } from '@fastgpt/service/common/redis/cache';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { startWechatPolling } from '@fastgpt/service/support/outLink/wechat/mq';
import { authOutLinkCrud } from '@fastgpt/service/support/permission/publish/authLink';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  WechatQrcodeStatusQuerySchema,
  WechatQrcodeStatusResponseSchema,
  type WechatQrcodeStatusQueryType,
  type WechatQrcodeStatusResponseType
} from '@fastgpt/global/openapi/support/outLink/api';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { getWechatQrcodeCacheKey } from '@fastgpt/service/support/outLink/wechat/qrcode';
import { assertWechatOutLink } from '@fastgpt/service/support/outLink/wechat/utils';

async function handler(
  req: ApiRequestProps<Record<string, never>, WechatQrcodeStatusQueryType>,
  res: ApiResponseType
): Promise<WechatQrcodeStatusResponseType> {
  res.setHeader('Cache-Control', 'no-store');

  const { outLinkId } = parseApiInput({
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

  const cacheKey = getWechatQrcodeCacheKey({ outLinkId, tmbId });
  const raw = await getRedisCache(cacheKey);
  if (!raw) {
    return WechatQrcodeStatusResponseSchema.parse({ status: 'expired' });
  }

  const qrData = JSON.parse(raw);
  const client = new ILinkClient();
  const statusData = await client.getQRCodeStatus(qrData.qrcode);

  if (statusData.status === 'confirmed' && statusData.bot_token && statusData.ilink_bot_id) {
    await MongoOutLink.updateOne(
      { _id: outLink._id },
      {
        $set: {
          'app.token': statusData.bot_token,
          'app.baseUrl': statusData.baseurl || 'https://ilinkai.weixin.qq.com',
          'app.accountId': statusData.ilink_bot_id,
          'app.userId': statusData.ilink_user_id || '',
          'app.status': 'online',
          'app.loginTime': new Date().toISOString(),
          'app.syncBuf': '',
          'app.lastError': ''
        }
      }
    );

    await delRedisCache(cacheKey);
    await startWechatPolling(outLink.shareId);
  }

  return WechatQrcodeStatusResponseSchema.parse({ status: statusData.status });
}

export default NextAPI(handler);
