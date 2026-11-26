import type { OpenAPIPath } from '../../type';
import { DevApiTagsMap } from '../../tag';
import {
  GetDatasetSearchPerfEventsQuerySchema,
  GetDatasetSearchPerfEventsResponseSchema,
  GetDatasetSearchPerfQuerySchema,
  GetDatasetSearchPerfResponseSchema
} from './performance';

/** 管理员运维看板-性能分析接口路由定义。 */
export const AdminOpsPerformancePath: OpenAPIPath = {
  '/proApi/admin/ops/performance/datasetSearch': {
    get: {
      summary: '获取知识库搜索性能总览与聚合分析',
      tags: [DevApiTagsMap.adminOpsPerformance],
      requestParams: {
        query: GetDatasetSearchPerfQuerySchema
      },
      responses: {
        200: {
          description: '知识库搜索性能聚合指标、规模对比、阶段拆解与 Rerank/问题优化模型分析',
          content: {
            'application/json': {
              schema: GetDatasetSearchPerfResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/admin/ops/performance/datasetSearch/events': {
    get: {
      summary: '分页查询知识库搜索单点性能排查明细',
      tags: [DevApiTagsMap.adminOpsPerformance],
      requestParams: {
        query: GetDatasetSearchPerfEventsQuerySchema
      },
      responses: {
        200: {
          description: '带单次阶段瀑布图与诊断详情的单点列表',
          content: {
            'application/json': {
              schema: GetDatasetSearchPerfEventsResponseSchema
            }
          }
        }
      }
    }
  }
};
