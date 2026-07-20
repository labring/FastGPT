import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  AdminGetModelsQuerySchema,
  AdminGetModelsResponseSchema,
  AdminGetChannelsQuerySchema,
  AdminGetChannelsResponseSchema,
  AdminGetUsageLogsQuerySchema,
  AdminGetUsageLogsResponseSchema,
  AdminModelStatsResponseSchema
} from './api';

/**
 * Pro Admin model management paths (design §11.6).
 * getModelStats lives under /admin/core/dashboard (its handler location,
 * mirroring getDatasetStats); the rest are under /admin/routes/models.
 */
export const AdminModelPath: OpenAPIPath = {
  '/admin/routes/models/getModels': {
    post: {
      summary: '获取全平台模型列表（root admin）',
      description: '全平台模型分页列表，含团队/创建人 JOIN 与渠道数（设计 §11）',
      tags: [DevApiTagsMap.adminModels],
      requestBody: {
        content: {
          'application/json': {
            schema: AdminGetModelsQuerySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取模型列表',
          content: {
            'application/json': {
              schema: AdminGetModelsResponseSchema
            }
          }
        }
      }
    }
  },
  '/admin/routes/models/getChannels': {
    post: {
      summary: '获取全平台渠道列表（root admin）',
      description: '系统渠道与全量成员渠道合并视图，成员渠道含创建人（设计 §2.9.6）',
      tags: [DevApiTagsMap.adminModels],
      requestBody: {
        content: {
          'application/json': {
            schema: AdminGetChannelsQuerySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取渠道列表',
          content: {
            'application/json': {
              schema: AdminGetChannelsResponseSchema
            }
          }
        }
      }
    }
  },
  '/admin/routes/models/getUsageLogs': {
    post: {
      summary: '获取全平台模型调用日志（root admin）',
      description: 'usage_items 全平台查询，含团队/创建人 JOIN（设计 §11）',
      tags: [DevApiTagsMap.adminModels],
      requestBody: {
        content: {
          'application/json': {
            schema: AdminGetUsageLogsQuerySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取调用日志',
          content: {
            'application/json': {
              schema: AdminGetUsageLogsResponseSchema
            }
          }
        }
      }
    }
  },
  '/admin/core/dashboard/getModelStats': {
    get: {
      summary: '获取模型资源统计（root admin）',
      description: '模型总数/系统模型/团队模型/启用数/渠道总数与类型分布（设计 §11.4）',
      tags: [DevApiTagsMap.adminModels],
      responses: {
        200: {
          description: '成功获取模型资源统计',
          content: {
            'application/json': {
              schema: AdminModelStatsResponseSchema
            }
          }
        }
      }
    }
  }
};
