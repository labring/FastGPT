import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  ExportUsageBodySchema,
  ExportUsageContentSchema,
  GetUsageBodySchema,
  GetUsageDashboardBodySchema,
  GetUsageDashboardResponseSchema,
  GetUsageResponseSchema
} from './api';

export const WalletUsagePath: OpenAPIPath = {
  '/proApi/support/wallet/usage/exportUsage': {
    post: {
      summary: '导出使用记录',
      description: '按筛选条件导出团队积分使用记录 CSV 文件',
      tags: [DevApiTagsMap.walletUsage],
      requestBody: {
        content: { 'application/json': { schema: ExportUsageBodySchema } }
      },
      responses: {
        200: {
          description: '成功返回使用记录 CSV 文件',
          content: { 'text/csv': { schema: ExportUsageContentSchema } }
        }
      }
    }
  },
  '/proApi/support/wallet/usage/getDashboardData': {
    post: {
      summary: '获取使用趋势数据',
      description: '按时间范围、成员和来源汇总团队积分使用趋势',
      tags: [DevApiTagsMap.walletUsage],
      requestBody: {
        content: { 'application/json': { schema: GetUsageDashboardBodySchema } }
      },
      responses: {
        200: {
          description: '成功返回使用趋势数据',
          content: { 'application/json': { schema: GetUsageDashboardResponseSchema } }
        }
      }
    }
  },
  '/proApi/support/wallet/usage/getUsage': {
    post: {
      summary: '获取使用记录',
      description: '分页查询团队积分使用明细，并返回来源成员和模块消耗信息',
      tags: [DevApiTagsMap.walletUsage],
      requestBody: {
        content: { 'application/json': { schema: GetUsageBodySchema } }
      },
      responses: {
        200: {
          description: '成功返回使用记录',
          content: { 'application/json': { schema: GetUsageResponseSchema } }
        }
      }
    }
  }
};
