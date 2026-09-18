import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  AIProxyChannelPathSchema,
  AIProxyLogDetailPathSchema,
  AIProxyMutationResponseSchema,
  CreateAdminAIProxyChannelBodySchema,
  CreateAdminAIProxyChannelResponseSchema,
  GetAIProxyChannelListResponseSchema,
  GetAIProxyChannelTypesResponseSchema,
  GetAIProxyDashboardQuerySchema,
  GetAIProxyDashboardResponseSchema,
  GetAIProxyLogDetailResponseSchema,
  SearchAIProxyLogsQuerySchema,
  SearchAIProxyLogsResponseSchema,
  UpdateAIProxyChannelBodySchema,
  UpdateAIProxyChannelStatusBodySchema
} from './api_channel';

export const AdminSystemChannelPath: OpenAPIPath = {
  '/aiproxy/api/channels/all': {
    get: {
      summary: '获取 AI Proxy 渠道列表',
      tags: [DevApiTagsMap.adminModelChannel],
      responses: {
        200: {
          description: '渠道列表',
          content: { 'application/json': { schema: GetAIProxyChannelListResponseSchema } }
        }
      }
    }
  },
  '/aiproxy/api/channels/type_metas': {
    get: {
      summary: '获取 AI Proxy 渠道协议元数据',
      tags: [DevApiTagsMap.adminModelChannel],
      responses: {
        200: {
          description: '渠道协议元数据',
          content: { 'application/json': { schema: GetAIProxyChannelTypesResponseSchema } }
        }
      }
    }
  },
  '/aiproxy/api/createChannel': {
    post: {
      summary: '创建 AI Proxy 渠道',
      tags: [DevApiTagsMap.adminModelChannel],
      requestBody: {
        content: { 'application/json': { schema: CreateAdminAIProxyChannelBodySchema } }
      },
      responses: {
        200: {
          description: '单渠道创建结果；成功时返回准确渠道 ID（兼容 AI Proxy v0.6.5）',
          content: { 'application/json': { schema: CreateAdminAIProxyChannelResponseSchema } }
        }
      }
    }
  },
  '/aiproxy/api/channel/{channelId}': {
    put: {
      summary: '更新 AI Proxy 渠道',
      tags: [DevApiTagsMap.adminModelChannel],
      requestParams: { path: AIProxyChannelPathSchema },
      requestBody: {
        content: { 'application/json': { schema: UpdateAIProxyChannelBodySchema } }
      },
      responses: {
        200: {
          description: '渠道更新成功',
          content: { 'application/json': { schema: AIProxyMutationResponseSchema } }
        }
      }
    },
    delete: {
      summary: '删除 AI Proxy 渠道',
      tags: [DevApiTagsMap.adminModelChannel],
      requestParams: { path: AIProxyChannelPathSchema },
      responses: {
        200: {
          description: '渠道删除成功',
          content: { 'application/json': { schema: AIProxyMutationResponseSchema } }
        }
      }
    }
  },
  '/aiproxy/api/channel/{channelId}/status': {
    post: {
      summary: '更新 AI Proxy 渠道状态',
      tags: [DevApiTagsMap.adminModelChannel],
      requestParams: { path: AIProxyChannelPathSchema },
      requestBody: {
        content: { 'application/json': { schema: UpdateAIProxyChannelStatusBodySchema } }
      },
      responses: {
        200: {
          description: '渠道状态更新成功',
          content: { 'application/json': { schema: AIProxyMutationResponseSchema } }
        }
      }
    }
  },
  '/aiproxy/api/logs/search': {
    get: {
      summary: '查询 AI Proxy 渠道日志',
      tags: [DevApiTagsMap.adminModelLog],
      requestParams: { query: SearchAIProxyLogsQuerySchema },
      responses: {
        200: {
          description: '分页返回渠道请求日志',
          content: { 'application/json': { schema: SearchAIProxyLogsResponseSchema } }
        }
      }
    }
  },
  '/aiproxy/api/logs/detail/{id}': {
    get: {
      summary: '获取 AI Proxy 渠道日志详情',
      tags: [DevApiTagsMap.adminModelLog],
      requestParams: { path: AIProxyLogDetailPathSchema },
      responses: {
        200: {
          description: '渠道日志请求和响应详情',
          content: { 'application/json': { schema: GetAIProxyLogDetailResponseSchema } }
        }
      }
    }
  },
  '/aiproxy/api/dashboardv2/': {
    get: {
      summary: '获取 AI Proxy 渠道统计看板',
      tags: [DevApiTagsMap.adminModelLog],
      requestParams: { query: GetAIProxyDashboardQuerySchema },
      responses: {
        200: {
          description: '按时间粒度返回渠道调用统计',
          content: { 'application/json': { schema: GetAIProxyDashboardResponseSchema } }
        }
      }
    }
  }
};
