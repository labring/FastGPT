import type { OpenAPIPath } from '../../type';
import { TagsMap } from '../../tag';
import {
  OutLinkListQuerySchema,
  WechatLogoutBodySchema,
  WechatLogoutResponseSchema,
  WechatQrcodeGenerateBodySchema,
  WechatQrcodeGenerateResponseSchema,
  WechatQrcodeStatusQuerySchema,
  WechatQrcodeStatusResponseSchema
} from './api';

export const OutLinkPath: OpenAPIPath = {
  '/support/outLink/list': {
    get: {
      summary: '获取应用的发布渠道列表',
      description: '查询指定应用的所有 OutLink 发布渠道配置',
      tags: [TagsMap.publishChannel],
      requestParams: {
        query: OutLinkListQuerySchema
      },
      responses: {
        200: {
          description: '成功返回发布渠道列表'
        }
      }
    }
  },
  '/support/outLink/wechat/qrcode/generate': {
    post: {
      summary: '生成微信发布渠道登录二维码',
      description: '为当前团队有管理权限的微信发布渠道生成 iLink 登录二维码',
      tags: [TagsMap.publishChannel],
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
      tags: [TagsMap.publishChannel],
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
      tags: [TagsMap.publishChannel],
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
