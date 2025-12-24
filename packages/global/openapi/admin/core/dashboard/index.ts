import { z } from 'zod';
import type { OpenAPIPath } from '../../../type';
import {
  GetDataChartsQuerySchema,
  GetChatFormDataResponseSchema,
  GetCostFormDataResponseSchema,
  GetPaysFormDataResponseSchema,
  GetUserFormDataResponseSchema,
  GetQpmRangeResponseSchema,
  GetUserStatsResponseSchema,
  GetAppStatsResponseSchema,
  GetDatasetStatsResponseSchema
} from './api';
import { TagsMap } from '../../../tag';

export const DashboardPath: OpenAPIPath = {
  '/admin/core/dashboard/getUserStats': {
    get: {
      summary: '获取用户全局统计',
      description: '获取用户总数和充值总数',
      tags: [TagsMap.adminDashboard],
      responses: {
        200: {
          description: '成功获取用户统计',
          content: {
            'application/json': {
              schema: GetUserStatsResponseSchema
            }
          }
        }
      }
    }
  },
  '/admin/core/dashboard/getAppStats': {
    get: {
      summary: '获取应用全局统计',
      description: '获取工作流、简易应用、工作流工具、HTTP 工具和 MCP 工具的总数',
      tags: [TagsMap.adminDashboard],
      responses: {
        200: {
          description: '成功获取应用统计',
          content: {
            'application/json': {
              schema: GetAppStatsResponseSchema
            }
          }
        }
      }
    }
  },
  '/admin/core/dashboard/getDatasetStats': {
    get: {
      summary: '获取知识库全局统计',
      description: '获取通用知识库、Web 站点同步、API、语雀、飞书知识库的总数以及索引总量',
      tags: [TagsMap.adminDashboard],
      responses: {
        200: {
          description: '成功获取知识库统计',
          content: {
            'application/json': {
              schema: GetDatasetStatsResponseSchema
            }
          }
        }
      }
    }
  },
  '/admin/core/dashboard/getChatFormData': {
    get: {
      summary: '获取对话统计数据',
      description: '获取对话数量和对话消息数量的时间序列统计数据',
      tags: [TagsMap.adminDashboard],
      requestParams: {
        query: z.object({
          startTime: z.string().meta({
            description: '查询起始时间（ISO 8601 格式）'
          })
        })
      },
      responses: {
        200: {
          description: '成功获取对话统计数据',
          content: {
            'application/json': {
              schema: GetChatFormDataResponseSchema
            }
          }
        }
      }
    }
  },
  '/admin/core/dashboard/getWorkflowQpmRange': {
    get: {
      summary: '获取工作流 QPM 范围分布',
      description: '按团队最大 QPM 统计各范围的团队数量',
      tags: [TagsMap.adminDashboard],
      requestParams: {
        query: z.object({
          startTime: z.string().meta({
            description: '查询起始时间（ISO 8601 格式）'
          })
        })
      },
      responses: {
        200: {
          description: '成功获取 QPM 范围分布',
          content: {
            'application/json': {
              schema: GetQpmRangeResponseSchema
            }
          }
        }
      }
    }
  },
  '/admin/core/dashboard/getCostFormData': {
    post: {
      summary: '获取消费统计数据',
      description: '获取积分消耗的时间序列统计数据',
      tags: [TagsMap.adminDashboard],
      requestBody: {
        content: {
          'application/json': {
            schema: GetDataChartsQuerySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取消费统计数据',
          content: {
            'application/json': {
              schema: GetCostFormDataResponseSchema
            }
          }
        }
      }
    }
  },
  '/admin/core/dashboard/getPaysFormData': {
    get: {
      summary: '获取支付统计数据',
      description: '获取订单和支付金额的时间序列统计数据',
      tags: [TagsMap.adminDashboard],
      requestParams: {
        query: z.object({
          startTime: z.string().meta({
            description: '查询起始时间（ISO 8601 格式）'
          })
        })
      },
      responses: {
        200: {
          description: '成功获取支付统计数据',
          content: {
            'application/json': {
              schema: GetPaysFormDataResponseSchema
            }
          }
        }
      }
    }
  },
  '/admin/core/dashboard/getUserFormData': {
    get: {
      summary: '获取用户注册统计数据',
      description: '获取用户注册数量的时间序列统计数据',
      tags: [TagsMap.adminDashboard],
      requestParams: {
        query: z.object({
          startTime: z.string().meta({
            description: '查询起始时间（ISO 8601 格式）'
          })
        })
      },
      responses: {
        200: {
          description: '成功获取用户统计数据',
          content: {
            'application/json': {
              schema: GetUserFormDataResponseSchema
            }
          }
        }
      }
    }
  }
};
