import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { ILinkClient } from '@fastgpt/service/support/outLink/wechat/ilinkClient';
import { getRedisCache, delRedisCache } from '@fastgpt/service/common/redis/cache';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { startWechatPolling } from '@fastgpt/service/support/outLink/wechat/mq';

async function handler(req: ApiRequestProps<{}, { shareId: string }>): Promise<{ status: string }> {
  const { shareId } = req.query;

  const raw = await getRedisCache(`publish:wechat:qrcode:${shareId}`);
  if (!raw) {
    return { status: 'expired' };
  }

  const qrData = JSON.parse(raw);
  const client = new ILinkClient();
  const statusData = await client.getQRCodeStatus(qrData.qrcode);

  if (statusData.status === 'confirmed' && statusData.bot_token && statusData.ilink_bot_id) {
    await MongoOutLink.updateOne(
      { shareId },
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

    await delRedisCache(`publish:wechat:qrcode:${shareId}`);
    await startWechatPolling(shareId);
  }

  return { status: statusData.status };
}

export default NextAPI(handler);
