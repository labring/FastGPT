import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import {
  AffectedModelsResponseSchema,
  BatchChannelBodySchema,
  BatchDeleteChannelsResponseSchema,
  ChannelModelsResponseSchema,
  CreateChannelBodySchema,
  CreateChannelResponseSchema,
  DeleteChannelQuerySchema,
  DeleteChannelResponseSchema,
  GetAffectedModelsQuerySchema,
  GetChannelDashboardQuerySchema,
  GetChannelDashboardResponseSchema,
  GetChannelLogDetailQuerySchema,
  GetChannelLogDetailResponseSchema,
  GetChannelLogsQuerySchema,
  GetChannelLogsResponseSchema,
  GetChannelModelsQuerySchema,
  ListChannelsQuerySchema,
  ListChannelsResponseSchema,
  ProviderMetasResponseSchema,
  UpdateChannelBodySchema,
  UpdateChannelStatusBodySchema
} from './api';

/**
 * 渠道管理 OpenAPI 路径定义
 * AI Proxy 作为渠道真实数据源，FastGPT 负责权限校验与 group 推导。
 */
export const ChannelPath: OpenAPIPath = {
  '/core/ai/model/channel/list': {
    get: {
      summary: '渠道列表',
      description:
        'team 返回当前登录成员本人渠道视图；root 带 channelType=system 时返回系统渠道视图。每条含关联模型数。',
      tags: [DevApiTagsMap.model],
      requestParams: { query: ListChannelsQuerySchema },
      responses: {
        200: {
          description: '渠道分页列表',
          content: { 'application/json': { schema: ListChannelsResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/channel/create': {
    post: {
      summary: '创建渠道',
      description:
        '由 channelType 显式指定 system/team：system 仅 root 可用；team 固定为当前成员分组。返回创建的渠道 ID，groupId 一律由服务端推导。',
      tags: [DevApiTagsMap.model],
      requestBody: {
        content: { 'application/json': { schema: CreateChannelBodySchema } }
      },
      responses: {
        200: {
          description: '创建成功，返回渠道 ID',
          content: { 'application/json': { schema: CreateChannelResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/channel/update': {
    put: {
      summary: '更新渠道',
      description:
        'aiproxy PUT 为全量替换；按渠道归属路由：成员仅本人渠道（channelNotExist 拒绝他人渠道），root 系统渠道优先、未命中回退成员渠道。Key 轮换即时生效。',
      tags: [DevApiTagsMap.model],
      requestBody: {
        content: { 'application/json': { schema: UpdateChannelBodySchema } }
      },
      responses: {
        200: {
          description: '操作成功'
        }
      }
    }
  },
  '/core/ai/model/channel/delete': {
    delete: {
      summary: '删除渠道',
      description:
        '删除前计算并返回受影响模型（仅关联该渠道的模型）；确认后删除，同上游名其他启用渠道由 aiproxy 自动切换。',
      tags: [DevApiTagsMap.model],
      requestParams: { query: DeleteChannelQuerySchema },
      responses: {
        200: {
          description: '删除成功，返回受影响模型清单',
          content: { 'application/json': { schema: DeleteChannelResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/channel/status': {
    post: {
      summary: '启用/停用渠道',
      description:
        'status: 1=启用 / 2=禁用。成员仅本人渠道；root 系统渠道优先、未命中回退成员渠道。',
      tags: [DevApiTagsMap.model],
      requestBody: {
        content: { 'application/json': { schema: UpdateChannelStatusBodySchema } }
      },
      responses: {
        200: {
          description: '操作成功'
        }
      }
    }
  },
  '/core/ai/model/channel/batch': {
    post: {
      summary: '批量操作渠道',
      description:
        '批量删除或批量修改渠道状态。action: delete（批量删除，返回受影响模型清单）/ status（批量更新状态）。',
      tags: [DevApiTagsMap.model],
      requestBody: {
        content: { 'application/json': { schema: BatchChannelBodySchema } }
      },
      responses: {
        200: {
          description: '操作成功',
          content: { 'application/json': { schema: BatchDeleteChannelsResponseSchema.optional() } }
        }
      }
    }
  },
  '/core/ai/model/channel/affectedModels': {
    get: {
      summary: '渠道删除保护预查',
      description: '返回仅关联该渠道的模型清单，供删除二次确认弹窗使用。',
      tags: [DevApiTagsMap.model],
      requestParams: { query: GetAffectedModelsQuerySchema },
      responses: {
        200: {
          description: '受影响模型清单',
          content: { 'application/json': { schema: AffectedModelsResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/channel/models': {
    get: {
      summary: '渠道关联模型列表',
      description:
        '返回该渠道桶内全部关联模型（上游模型名匹配），供渠道列表「关联模型数」列悬浮查看。与 affectedModels 不同：不受「仅此渠道一条通路」限制。',
      tags: [DevApiTagsMap.model],
      requestParams: { query: GetChannelModelsQuerySchema },
      responses: {
        200: {
          description: '关联模型清单',
          content: { 'application/json': { schema: ChannelModelsResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/channel/providerMetas': {
    get: {
      summary: '获取渠道 Provider 元数据',
      description: '返回渠道创建和编辑表单所需的非敏感 Provider 默认配置。',
      tags: [DevApiTagsMap.model],
      responses: {
        200: {
          description: 'Provider 元数据',
          content: { 'application/json': { schema: ProviderMetasResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/channel/logs': {
    get: {
      summary: '查询渠道调用日志',
      description:
        'system 仅 root 查询全局系统渠道日志；team 查询当前登录成员私有 group-channel 日志。groupId 由服务端推导，channelId 会先校验归属。',
      tags: [DevApiTagsMap.model],
      requestParams: { query: GetChannelLogsQuerySchema },
      responses: {
        200: {
          description: '渠道调用日志分页列表',
          content: { 'application/json': { schema: GetChannelLogsResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/channel/logDetail': {
    get: {
      summary: '获取渠道调用日志详情',
      description:
        '按当前登录成员可访问的 system/team 范围读取请求与响应详情，team 日志 ID 会由 aiproxy 再次按服务端推导的 group 校验。',
      tags: [DevApiTagsMap.model],
      requestParams: { query: GetChannelLogDetailQuerySchema },
      responses: {
        200: {
          description: '渠道调用日志详情',
          content: { 'application/json': { schema: GetChannelLogDetailResponseSchema } }
        }
      }
    }
  },
  '/core/ai/model/channel/dashboard': {
    get: {
      summary: '查询渠道监控数据',
      description:
        'system 仅 root 查询全局系统渠道监控；team 查询当前登录成员私有 group-channel 监控。groupId 由服务端推导，channelId 会先校验归属。',
      tags: [DevApiTagsMap.model],
      requestParams: { query: GetChannelDashboardQuerySchema },
      responses: {
        200: {
          description: '渠道监控时序数据',
          content: { 'application/json': { schema: GetChannelDashboardResponseSchema } }
        }
      }
    }
  }
};
