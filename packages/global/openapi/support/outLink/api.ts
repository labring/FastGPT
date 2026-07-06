import z from 'zod';
import { PublishChannelEnum } from '../../../support/outLink/constant';
import { ObjectIdSchema } from '../../../common/type/mongo';

// ============= OutLink List =============
export const OutLinkListQuerySchema = z.object({
  appId: ObjectIdSchema.describe('应用ID'),
  type: z.enum(PublishChannelEnum).describe('发布渠道类型')
});
export type OutLinkListQueryType = z.infer<typeof OutLinkListQuerySchema>;

const WechatOutLinkIdSchema = ObjectIdSchema.meta({
  description: '微信发布渠道 ID'
});

/* ============================================================================
 * API: 生成微信发布渠道登录二维码
 * Route: POST /api/support/outLink/wechat/qrcode/generate
 * Method: POST
 * Description: 为当前团队有管理权限的微信发布渠道生成 iLink 登录二维码。
 * Tags: ['发布渠道', '微信发布渠道']
 * ============================================================================ */

export const WechatQrcodeGenerateBodySchema = z.object({
  outLinkId: WechatOutLinkIdSchema
});
export type WechatQrcodeGenerateBodyType = z.infer<typeof WechatQrcodeGenerateBodySchema>;

export const WechatQrcodeGenerateResponseSchema = z.object({
  qrcode: z.string().meta({ description: 'iLink 二维码标识' }),
  qrcode_img_content: z.string().meta({ description: '二维码内容' }),
  expireTime: z.number().meta({ example: 480, description: '二维码有效期，单位秒' })
});
export type WechatQrcodeGenerateResponseType = z.infer<typeof WechatQrcodeGenerateResponseSchema>;

/* ============================================================================
 * API: 查询微信发布渠道登录二维码状态
 * Route: GET /api/support/outLink/wechat/qrcode/status
 * Method: GET
 * Description: 查询当前登录成员发起的微信发布渠道二维码登录状态，确认后写入机器人凭据。
 * Tags: ['发布渠道', '微信发布渠道']
 * ============================================================================ */

export const WechatQrcodeStatusQuerySchema = z.object({
  outLinkId: WechatOutLinkIdSchema
});
export type WechatQrcodeStatusQueryType = z.infer<typeof WechatQrcodeStatusQuerySchema>;

export const WechatQrcodeStatusResponseSchema = z.object({
  status: z.enum(['wait', 'scaned', 'confirmed', 'expired']).meta({
    example: 'wait',
    description: '二维码登录状态'
  })
});
export type WechatQrcodeStatusResponseType = z.infer<typeof WechatQrcodeStatusResponseSchema>;

/* ============================================================================
 * API: 登出微信发布渠道
 * Route: POST /api/support/outLink/wechat/logout
 * Method: POST
 * Description: 将当前团队有管理权限的微信发布渠道下线并清空机器人凭据。
 * Tags: ['发布渠道', '微信发布渠道']
 * ============================================================================ */

export const WechatLogoutBodySchema = z.object({
  outLinkId: WechatOutLinkIdSchema
});
export type WechatLogoutBodyType = z.infer<typeof WechatLogoutBodySchema>;

export const WechatLogoutResponseSchema = z.undefined().meta({
  description: '登出成功'
});
export type WechatLogoutResponseType = z.infer<typeof WechatLogoutResponseSchema>;
