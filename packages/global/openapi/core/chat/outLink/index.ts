import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  InitOutLinkChatQuerySchema,
  InitOutLinkChatResponseSchema,
  TrackOutLinkBrandBodySchema
} from './api';

export const OutLinkChatPath: OpenAPIPath = {
  '/core/chat/outLink/track': {
    post: {
      summary: '上报分享链接品牌事件',
      description:
        '仅接受品牌曝光和点击。曝光必须携带页面生命周期内固定的随机 eventId，重试复用该 ID，同一曝光只写入一次；点击逐次记录，无需 eventId。按外链发布配置校验访问资格，受保护链接仍需登录态。仅在商业版且品牌实际展示时记录，团队和应用归属由服务端解析；成功响应在数据库写入完成后返回。鉴权前每个 IP 每分钟最多 300 次，写入前每个外链与 IP 组合每分钟最多 60 次，曝光重试与点击共用额度，独立于聊天 QPM。超限或限流服务不可用时返回 429，客户端应停止本页曝光重试。',
      tags: [DevApiTagsMap.chatHistory],
      requestBody: {
        content: {
          'application/json': { schema: TrackOutLinkBrandBodySchema }
        }
      },
      responses: {
        200: { description: '品牌事件处理完成，无业务返回数据' },
        429: { description: '品牌事件请求超限或限流服务不可用' }
      }
    }
  },
  '/core/chat/outLink/init': {
    get: {
      summary: '初始化外链会话',
      description: [
        '通过分享链接初始化外链会话，返回应用配置、变量和已有会话状态。',
        'Query 必须传 outLinkAuthData，包含 shareId 与 outLinkUid，并使用 JSON 字符串序列化；chatId 可选。应用身份由分享链接解析，无需传 appId 或 skillId。',
        '按外链发布配置鉴权，受保护外链仍需登录态；应用会话与 Skill 调试会话请使用 GET /api/core/chat/init。'
      ].join('\n\n'),
      tags: [DevApiTagsMap.chatHistory],
      requestParams: {
        query: InitOutLinkChatQuerySchema
      },
      responses: {
        200: {
          description: '成功返回会话初始化信息',
          content: {
            'application/json': {
              schema: InitOutLinkChatResponseSchema
            }
          }
        }
      }
    }
  }
};
