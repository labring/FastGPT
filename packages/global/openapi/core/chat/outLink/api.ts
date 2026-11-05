import z from 'zod';
import { TrackEnum } from '../../../../common/middle/tracks/constants';
import { InitChatResponseSchema } from '../controler/api';
import {
  OutLinkBrandingSchema,
  OutLinkBrandTrackEventSchema
} from '../../../../support/outLink/branding';
import {
  OutLinkChatAuthQuerySchema,
  OutLinkChatAuthSchema
} from '../../../../support/permission/chat';

/* ============================================================================
 * API: 初始化外链会话
 * Route: GET /api/core/chat/outLink/init
 * Description: 通过分享身份初始化外链会话；应用或 Skill 调试会话使用 /core/chat/init。
 * ============================================================================ */
export const InitOutLinkChatQuerySchema = z.object({
  chatId: z.string().optional().describe('已有会话 ID，可省略'),
  outLinkAuthData: OutLinkChatAuthQuerySchema.meta({
    example: JSON.stringify({ shareId: 'share-id', outLinkUid: 'outlink-user-id' }),
    description: '外链鉴权数据，包含 shareId 与 outLinkUid。GET query 中需 JSON 序列化。'
  })
});
export type InitOutLinkChatQueryType = z.infer<typeof InitOutLinkChatQuerySchema>;
export const InitOutLinkChatResponseSchema = InitChatResponseSchema.and(
  z.object({
    branding: OutLinkBrandingSchema.meta({ description: '服务端计算的品牌有效展示状态' })
  })
);
export type InitOutLinkChatResponseType = z.infer<typeof InitOutLinkChatResponseSchema>;

/* ============================================================================
 * API: 上报分享链接品牌事件
 * Route: POST /api/core/chat/outLink/track
 * Method: POST
 * Description: 按外链访问资格校验品牌事件，商业版在写入 tracks 后返回空成功响应。
 * Tags: ['Chat']
 * ============================================================================ */
const TrackOutLinkBrandBaseBodySchema = z.strictObject({
  outLinkAuthData: OutLinkChatAuthSchema.meta({
    description: '外链访问身份；受保护链接仍需请求头或 Cookie 中的登录态',
    example: { shareId: 'share-id', outLinkUid: 'outlink-user-id' }
  })
});
export const TrackOutLinkBrandBodySchema = z.discriminatedUnion('event', [
  TrackOutLinkBrandBaseBodySchema.extend({
    event: OutLinkBrandTrackEventSchema.extract([TrackEnum.shareBrandExposure]),
    eventId: z.string().min(1).max(64).meta({
      description: '页面生命周期内固定的随机曝光 ID；重试和布局切换时必须复用',
      example: 'V1StGXR8_Z5jdHi6B-myT7Ab'
    })
  }),
  TrackOutLinkBrandBaseBodySchema.extend({
    event: OutLinkBrandTrackEventSchema.extract([TrackEnum.shareBrandClick])
  })
]);
export type TrackOutLinkBrandBodyType = z.infer<typeof TrackOutLinkBrandBodySchema>;
