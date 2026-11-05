import type { ApiRequestProps } from '@fastgpt/next/type';
import { TrackOutLinkBrandBodySchema } from '@fastgpt/global/openapi/core/chat/outLink/api';
import { TrackModel } from '@fastgpt/service/common/middle/tracks/schema';
import mongoose from '@fastgpt/service/common/mongo';
import { TrackEnum } from '@fastgpt/global/common/middle/tracks/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { serviceEnv } from '@fastgpt/service/env';
import { getOutLinkBranding } from '@fastgpt/service/support/outLink/branding/service';
import { authOutLink } from '@fastgpt/service/support/permission/publish/authChat';
import { getTeamCanHideShareBrand } from '@fastgpt/service/support/wallet/sub/service';
import { getClientIpFromRequest } from '@fastgpt/service/common/security/clientIp';
import {
  assertOutLinkBrandRequestRateLimit,
  assertOutLinkBrandWriteRateLimit
} from '@fastgpt/service/common/rateLimit/interface/outLinkBrand';
import { NextAPI } from '@/service/middleware/entry';

/** 校验外链访问资格后记录品牌事件；同一曝光重试返回成功，其他写入失败仍交由客户端重试。 */
export async function handler(req: ApiRequestProps): Promise<void> {
  const { body } = parseApiInput({
    req,
    bodySchema: TrackOutLinkBrandBodySchema
  });
  const { event, outLinkAuthData } = body;
  if (!global.feConfigs?.isPlus || !serviceEnv.SHOW_OUTLINK_BRAND) return;

  // 先限制鉴权成本；缺失 IP 时共用兜底桶，不能绕过限流。
  const ip = getClientIpFromRequest(req) ?? 'unknown';
  await assertOutLinkBrandRequestRateLimit({ ip });

  // 身份和归属由外链解析，不能直接接受客户端传入的团队或应用。
  const { appId, outLinkConfig } = await authOutLink({ ...outLinkAuthData, req });
  const branding = await getOutLinkBranding({
    outLink: outLinkConfig,
    getTeamCanHideShareBrand
  });
  if (!branding.showBrand) return;

  await assertOutLinkBrandWriteRateLimit({ outLinkId: String(outLinkConfig._id), ip });

  try {
    await TrackModel.create({
      event,
      eventId: body.event === TrackEnum.shareBrandExposure ? body.eventId : undefined,
      teamId: String(outLinkConfig.teamId),
      data: { appId: String(appId), shareId: outLinkAuthData.shareId }
    });
  } catch (error) {
    // 写入成功但响应丢失、或并发重试时，只有曝光去重索引的冲突可以视为成功。
    if (
      event === TrackEnum.shareBrandExposure &&
      error instanceof mongoose.mongo.MongoServerError &&
      error.code === 11000 &&
      error.keyPattern?.event === 1 &&
      error.keyPattern?.eventId === 1
    )
      return;
    throw error;
  }
}

export default NextAPI(handler);
