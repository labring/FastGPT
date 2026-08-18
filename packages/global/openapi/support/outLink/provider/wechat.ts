import z from 'zod';
import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import { ObjectIdSchema } from '../../../../common/type/mongo';

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
  status: z
    .enum([
      'wait',
      'scaned',
      'confirmed',
      'expired',
      'scaned_but_redirect',
      'need_verifycode',
      'verify_code_blocked',
      'binded_redirect'
    ])
    .meta({
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

export const WechatOutLinkPath: OpenAPIPath = {
  '/support/outLink/wechat/qrcode/generate': {
    post: {
      summary: '生成微信发布渠道登录二维码',
      description: '为当前团队有管理权限的微信发布渠道生成 iLink 登录二维码',
      tags: [DevApiTagsMap.publishChannel],
      requestBody: {
        content: {
          'application/json': {
            schema: WechatQrcodeGenerateBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功生成二维码',
          content: {
            'application/json': {
              schema: WechatQrcodeGenerateResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/outLink/wechat/qrcode/status': {
    get: {
      summary: '查询微信发布渠道登录二维码状态',
      description: '查询当前登录成员发起的微信发布渠道二维码登录状态',
      tags: [DevApiTagsMap.publishChannel],
      requestParams: {
        query: WechatQrcodeStatusQuerySchema
      },
      responses: {
        200: {
          description: '成功返回二维码状态',
          content: {
            'application/json': {
              schema: WechatQrcodeStatusResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/outLink/wechat/logout': {
    post: {
      summary: '登出微信发布渠道',
      description: '将当前团队有管理权限的微信发布渠道下线并清空机器人凭据',
      tags: [DevApiTagsMap.publishChannel],
      requestBody: {
        content: {
          'application/json': {
            schema: WechatLogoutBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功登出微信发布渠道',
          content: {
            'application/json': {
              schema: WechatLogoutResponseSchema
            }
          }
        }
      }
    }
  }
};
