import type { PushOutLinkBrandTrackBodyType } from '@fastgpt/global/openapi/common/other/api';
import { TrackEnum } from '@fastgpt/global/common/middle/tracks/constants';
import type { NodeHttpRequest } from '../../../types/http';
import { TrackModel } from '../../../common/middle/tracks/schema';
import mongoose from '../../../common/mongo';
import { serviceEnv } from '../../../env';
import { getClientIpFromRequest } from '../../../common/security/clientIp';
import {
  assertOutLinkBrandRequestRateLimit,
  assertOutLinkBrandWriteRateLimit
} from '../../../common/rateLimit/interface/outLinkBrand';
import { authOutLink } from '../../permission/publish/authChat';
import { getTeamCanHideShareBrand } from '../../wallet/sub/service';
import { getOutLinkBranding } from './service';

/**
 * 认证并记录外链品牌事件。
 * 外链身份只用于访问校验，团队和应用归属由服务端外链配置派生；曝光使用 eventId 幂等，
 * 点击逐次写入。品牌未实际展示时返回成功但不产生埋点。
 */
export async function recordOutLinkBrandTrack({
  req,
  body
}: {
  req: NodeHttpRequest;
  body: PushOutLinkBrandTrackBodyType;
}): Promise<void> {
  if (!serviceEnv.SHOW_OUTLINK_BRAND) return;

  // 1. 先按真实客户端 IP 限制公开请求，避免鉴权和外部身份 Hook 被滥用。
  const ip = getClientIpFromRequest(req) ?? 'unknown';
  await assertOutLinkBrandRequestRateLimit({ ip });

  // 2. 通过分享身份解析可信的外链、团队和应用归属；不能接受客户端注入的归属字段。
  const { appId, outLinkConfig } = await authOutLink({
    ...body.outLinkAuthData,
    req
  });

  // 3. 权益失效或链接偏好关闭时不记录，避免把未展示的品牌计入曝光。
  const branding = await getOutLinkBranding({
    outLink: outLinkConfig,
    getTeamCanHideShareBrand
  });
  if (!branding.showBrand) return;

  // 4. 限制单个外链和 IP 的写入量，曝光重试与点击共享额度。
  await assertOutLinkBrandWriteRateLimit({
    outLinkId: String(outLinkConfig._id),
    ip
  });

  try {
    await TrackModel.create({
      event: body.event,
      eventId: body.event === TrackEnum.shareBrandExposure ? body.eventId : undefined,
      teamId: String(outLinkConfig.teamId),
      data: {
        appId: String(appId),
        shareId: body.outLinkAuthData.shareId
      }
    });
  } catch (error) {
    // 写入成功但响应丢失或并发重试时，仅曝光唯一索引冲突可以视为成功。
    if (
      body.event === TrackEnum.shareBrandExposure &&
      error instanceof mongoose.mongo.MongoServerError &&
      error.code === 11000 &&
      error.keyPattern?.event === 1 &&
      error.keyPattern?.eventId === 1
    )
      return;

    throw error;
  }
}
