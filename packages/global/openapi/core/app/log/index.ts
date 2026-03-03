import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import { z } from 'zod';
import {
  GetAppChatLogsBodySchema,
  GetAppChatLogsResponseSchema,
  ExportChatLogsBodySchema,
  GetChartDataBodySchema,
  GetChartDataResponseSchema,
  GetTotalDataQuerySchema,
  GetTotalDataResponseSchema,
  GetLogKeysQuerySchema,
  GetLogKeysResponseSchema,
  UpdateLogKeysBodySchema
} from './api';

export const AppLogPath: OpenAPIPath = {
  '/core/app/logs/getLogKeys': {
    get: {
      summary: '获取应用日志键',
      description: '获取应用的日志键列表',
      tags: [TagsMap.appLog],
      requestParams: {
        query: GetLogKeysQuerySchema
      },
      responses: {
        200: {
          description: '成功获取应用日志键',
          content: {
            'application/json': {
              schema: GetLogKeysResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/logs/updateLogKeys': {
    post: {
      summary: '更新应用日志键',
      description: '更新应用的日志键列表',
      tags: [TagsMap.appLog],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateLogKeysBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新应用日志键',
          content: {
            'application/json': {
              schema: z.object({})
            }
          }
        }
      }
    }
  },
  '/core/app/logs/list': {
    post: {
      summary: '获取应用日志列表',
      description: '分页获取应用的对话日志列表，支持按时间范围、来源、用户等条件筛选',
      tags: [TagsMap.appLog],
      requestBody: {
        content: {
          'application/json': {
            schema: GetAppChatLogsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取应用日志列表',
          content: {
            'application/json': {
              schema: GetAppChatLogsResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/logs/exportLogs': {
    post: {
      summary: '导出应用日志',
      description: '导出应用的对话日志为 CSV 文件，支持自定义导出字段和筛选条件',
      tags: [TagsMap.appLog],
      requestBody: {
        content: {
          'application/json': {
            schema: ExportChatLogsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功导出应用日志，返回 CSV 文件',
          content: {
            'text/csv': {
              schema: z.string()
            }
          }
        }
      }
    }
  },
  '/proApi/core/app/logs/getTotalData': {
    get: {
      summary: '获取应用总体数据统计',
      description: '获取应用的总体数据统计，包括总用户数、总对话数、总积分消耗',
      tags: [TagsMap.appLog],
      requestParams: {
        query: GetTotalDataQuerySchema
      },
      responses: {
        200: {
          description: '成功获取应用总体数据',
          content: {
            'application/json': {
              schema: GetTotalDataResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/core/app/logs/getChartData': {
    post: {
      summary: '获取应用图表数据',
      description: '获取应用的图表统计数据，包括用户数据、对话数据、应用数据的时序统计',
      tags: [TagsMap.appLog],
      requestBody: {
        content: {
          'application/json': {
            schema: GetChartDataBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取应用图表数据',
          content: {
            'application/json': {
              schema: GetChartDataResponseSchema
            }
          }
        }
      }
    }
  }
};
