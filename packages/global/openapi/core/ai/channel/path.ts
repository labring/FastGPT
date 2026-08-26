import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  AffectedModelsResponseSchema,
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
  GetModelChannelsQuerySchema,
  ListChannelsQuerySchema,
  ListChannelsResponseSchema,
  ModelChannelsResponseSchema,
  ProviderMetasResponseSchema,
  TestChannelQuerySchema,
  TestChannelResponseSchema,
  UpdateChannelBodySchema,
  UpdateChannelResponseSchema,
  UpdateChannelStatusBodySchema,
  UpdateChannelStatusResponseSchema
} from './api';

/**
 * Channel management paths (design §2.9.4).
 *
 * aiproxy is the single source of truth for channels; these endpoints enforce
 * FastGPT-side auth and derives groupId from the session. System channels are
 * root-only; member channel creation requires TeamModelCreatePermissionVal,
 * while operations on existing channels are guarded by ownership. Channel id
 * is always the aiproxy channel id; delete returns the pre-deletion affected
 * models so the client can run the F2-S4/F3-S4 confirmation flow.
 */
export const ChannelPath: OpenAPIPath = {
  '/core/ai/channel/list': {
    get: {
      summary: '渠道列表',
      description:
        '成员：本人渠道视图；root 带 groupType=system 返回系统渠道视图，groupType=team 返回 root 本人渠道视图。每条含关联模型数。',
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
  '/core/ai/channel/create': {
    post: {
      summary: '创建渠道',
      description:
        '按角色裁决目标：root 创建系统渠道；成员在本人团队 group 创建渠道（group 由 aiproxy 幂等自建）。groupId 一律服务端推导。',
      tags: [DevApiTagsMap.model],
      requestBody: {
        content: { 'application/json': { schema: CreateChannelBodySchema } }
      },
      responses: {
        200: {
          description: '操作成功（前端刷新列表获取新渠道）',
          content: { 'application/json': { schema: CreateChannelResponseSchema } }
        }
      }
    }
  },
  '/core/ai/channel/update': {
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
          description: '操作成功',
          content: { 'application/json': { schema: UpdateChannelResponseSchema } }
        }
      }
    }
  },
  '/core/ai/channel/delete': {
    delete: {
      summary: '删除渠道',
      description:
        '删除前计算并返回受影响模型（仅关联该渠道的模型，F2-S4/F3-S4 二次确认数据源）；确认后删除，同上游名其他启用渠道由 aiproxy 自动切换。',
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
  '/core/ai/channel/status': {
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
          description: '操作成功',
          content: { 'application/json': { schema: UpdateChannelStatusResponseSchema } }
        }
      }
    }
  },
  '/core/ai/channel/test': {
    get: {
      summary: '渠道测试',
      description: '对指定渠道的单个上游模型名发起测试，结果持久化到 aiproxy。成员仅本人渠道。',
      tags: [DevApiTagsMap.model],
      requestParams: { query: TestChannelQuerySchema },
      responses: {
        200: {
          description: '测试成功',
          content: { 'application/json': { schema: TestChannelResponseSchema } }
        }
      }
    }
  },
  '/core/ai/channel/affectedModels': {
    get: {
      summary: '渠道删除保护预查',
      description: '返回仅关联该渠道的模型清单，供删除二次确认弹窗使用（F2-S4/F3-S4）。',
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
  '/core/ai/channel/models': {
    get: {
      summary: '渠道关联模型列表',
      description:
        '返回该渠道桶内全部关联模型（上游模型名匹配），供渠道列表「关联模型数」列悬浮查看（F2-S5 场景3/4）。与 affectedModels 不同：不受「仅此渠道一条通路」限制。',
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
  '/core/ai/channel/modelChannels': {
    get: {
      summary: '模型关联渠道列表',
      description:
        '返回某模型桶内关联的全部渠道（模型列表「渠道数」列悬浮查看，设计 §7.3/F2-S5 场景2）。模型必须在请求者可访问集合内。',
      tags: [DevApiTagsMap.model],
      requestParams: { query: GetModelChannelsQuerySchema },
      responses: {
        200: {
          description: '关联渠道清单',
          content: { 'application/json': { schema: ModelChannelsResponseSchema } }
        }
      }
    }
  },
  '/core/ai/channel/providerMetas': {
    get: {
      summary: 'Get channel provider metadata',
      description: 'Returns non-sensitive provider defaults for the channel create and edit forms.',
      tags: [DevApiTagsMap.model],
      responses: {
        200: {
          description: 'Provider metadata',
          content: { 'application/json': { schema: ProviderMetasResponseSchema } }
        }
      }
    }
  },
  '/core/ai/channel/logs': {
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
  '/core/ai/channel/logDetail': {
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
  '/core/ai/channel/dashboard': {
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
