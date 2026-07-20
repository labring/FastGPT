import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import { GetLogListBodySchema, GetLogListResponseSchema } from './api';

export const AdminLogsPath: OpenAPIPath = {
  '/admin/common/log/list': {
    post: {
      summary: '获取系统日志列表',
      description: '分页获取系统日志，支持按关键词搜索和日志等级筛选',
      tags: [DevApiTagsMap.adminLogs],
      requestBody: {
        content: {
          'application/json': {
            schema: GetLogListBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取日志列表',
          content: {
            'application/json': {
              schema: GetLogListResponseSchema
            }
          }
        }
      }
    }
  }
};
