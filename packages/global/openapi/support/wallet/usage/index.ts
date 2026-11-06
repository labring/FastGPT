import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  ExportUsageBodySchema,
  ExportUsageContentSchema,
  GetUsageBodySchema,
  GetUsageDashboardBodySchema,
  GetUsageDashboardResponseSchema,
  GetUsageResponseSchema,
  UsageQueryBodySchema,
  UsageQueryResponseSchema,
  UsageFilterOptionsBodySchema,
  UsageFilterOptionsResponseSchema,
  UsageExportConflictSchema
} from './api';

export const WalletUsagePath: OpenAPIPath = {
  '/proApi/support/wallet/usage/query': {
    post: {
      summary: '查询当前范围的使用记录或日统计',
      tags: [DevApiTagsMap.walletUsage],
      requestBody: { content: { 'application/json': { schema: UsageQueryBodySchema } } },
      responses: {
        200: {
          description: '数据和最新筛选上下文',
          content: { 'application/json': { schema: UsageQueryResponseSchema } }
        },
        400: { description: '请求参数无效' },
        401: { description: '未登录' },
        403: { description: '无读取权限' }
      }
    }
  },
  '/proApi/support/wallet/usage/filterOptions': {
    post: {
      summary: '浏览使用记录筛选选项或校验导出范围',
      tags: [DevApiTagsMap.walletUsage],
      requestBody: { content: { 'application/json': { schema: UsageFilterOptionsBodySchema } } },
      responses: {
        200: {
          description: '只读选项及筛选上下文',
          content: { 'application/json': { schema: UsageFilterOptionsResponseSchema } }
        },
        400: { description: '请求参数无效' },
        401: { description: '未登录' },
        403: { description: '无读取权限' }
      }
    }
  },
  '/proApi/support/wallet/usage/exportUsage': {
    post: {
      summary: '导出使用记录',
      description: '按筛选条件导出团队积分使用记录 CSV 文件',
      tags: [DevApiTagsMap.walletUsage],
      requestBody: {
        content: { 'application/json': { schema: ExportUsageBodySchema } }
      },
      responses: {
        400: { description: '请求参数无效' },
        401: { description: '未登录' },
        403: { description: '无读取权限' },
        409: {
          description: '筛选或权限范围改变，本次没有生成 CSV；data 包含最新上下文',
          content: { 'application/json': { schema: UsageExportConflictSchema } }
        },
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
