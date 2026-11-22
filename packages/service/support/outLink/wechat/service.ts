import { randomUUID } from 'node:crypto';
import { WECHAT_QR_LOGIN_TTL_SECONDS, wechatQrLoginCache } from '@fastgpt/dal/redis/caches';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import { WechatAppSchema, type OutLinkSchemaType } from '@fastgpt/global/support/outLink/type';
import { MongoOutLink } from '../schema';
import { ILinkClient, type QRStatusResponse } from './ilinkClient';
import { startWechatPolling } from './mq';
import { getWechatBaseUrl } from './request';

const QrAttemptSchema = WechatAppSchema.pick({ qrAttemptId: true, bindingId: true });

/** 先登记会话，再向微信取码。迟到的旧请求只能写入自己的缓存。 */
export async function generateWechatQrCode({
  outLinkId,
  tmbId
}: {
  outLinkId: string;
  tmbId: string;
}) {
  const attemptId = randomUUID();
  const result = await MongoOutLink.updateOne(
    { _id: outLinkId, type: PublishChannelEnum.wechat },
    { $set: { 'app.qrAttemptId': attemptId } }
  );
  if (!result.matchedCount) throw OutLinkErrEnum.unExist;

  const qr = await new ILinkClient().getQRCode();
  await wechatQrLoginCache.set({ outLinkId, tmbId, attemptId, data: qr });
  return { ...qr, attemptId, expireTime: WECHAT_QR_LOGIN_TTL_SECONDS };
}

/** 只允许当前扫码会话生效，同一次确认重试只补调度，不重置已绑定的连接。 */
export async function getWechatQrStatus({
  outLink,
  tmbId,
  requestedAttemptId
}: {
  outLink: Pick<OutLinkSchemaType, '_id' | 'shareId'> & { app?: unknown };
  tmbId: string;
  requestedAttemptId?: string;
}): Promise<QRStatusResponse['status']> {
  const outLinkId = String(outLink._id);
  const { data: app } = QrAttemptSchema.safeParse(outLink.app);
  const attemptId = app?.qrAttemptId;
  // 旧版本在途二维码没有对应的绑定会话，升级后从生成二维码入口重新开始。
  if (!attemptId || (requestedAttemptId !== undefined && requestedAttemptId !== attemptId)) {
    return 'expired';
  }
  const qr = await wechatQrLoginCache.get({ outLinkId, tmbId, attemptId });
  if (!qr) return 'expired';

  if (app.bindingId !== attemptId) {
    const confirmation = await new ILinkClient().getQRCodeStatus(qr.qrcode);
    if (confirmation.status !== 'confirmed') return confirmation.status;
    if (!confirmation.bot_token || !confirmation.ilink_bot_id) {
      throw new Error('iLink confirmed the QR code without binding credentials');
    }

    const currentAttempt = {
      _id: outLinkId,
      type: PublishChannelEnum.wechat,
      'app.qrAttemptId': attemptId
    };
    const result = await MongoOutLink.updateOne(
      { ...currentAttempt, 'app.bindingId': { $ne: attemptId } },
      {
        $set: {
          'app.token': confirmation.bot_token,
          'app.baseUrl': getWechatBaseUrl(confirmation.baseurl),
          'app.accountId': confirmation.ilink_bot_id,
          'app.userId': confirmation.ilink_user_id ?? '',
          'app.status': 'online',
          'app.bindingId': attemptId,
          'app.loginTime': new Date().toISOString(),
          'app.syncBuf': '',
          'app.lastError': ''
        }
      }
    );
    if (
      !result.modifiedCount &&
      !(await MongoOutLink.exists({ ...currentAttempt, 'app.bindingId': attemptId }))
    ) {
      return 'expired';
    }
  }

  // 缓存随 TTL 到期。保留它可让落库成功但首次入队失败的客户端确认重试。
  await startWechatPolling(outLink.shareId);
  return 'confirmed';
}

/** 下线同时撤销待确认的扫码会话，队列中的轮询会在读取状态后结束。 */
export async function logoutWechatChannel(outLinkId: string) {
  await MongoOutLink.updateOne(
    { _id: outLinkId, type: PublishChannelEnum.wechat },
    {
      $set: { 'app.status': 'offline', 'app.token': '', 'app.lastError': '' },
      $unset: { 'app.qrAttemptId': 1 }
    }
  );
}
