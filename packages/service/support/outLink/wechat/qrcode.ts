/**
 * 生成微信 iLink 二维码登录缓存 key。
 *
 * outLinkId 绑定具体发布渠道，tmbId 绑定发起操作的团队成员，确保状态确认只能消费
 * 当前登录成员自己创建的二维码。
 */
export const getWechatQrcodeCacheKey = ({
  outLinkId,
  tmbId
}: {
  outLinkId: string;
  tmbId: string;
}) => `publish:wechat:qrcode:${outLinkId}:${tmbId}`;
