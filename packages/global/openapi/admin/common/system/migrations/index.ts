import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import {
  GetSystemMigrationFailedRecordsQuerySchema,
  RetrySystemMigrationBodySchema,
  SystemMigrationFailedRecordsResponseSchema,
  SystemMigrationListResponseSchema
} from '../../../../../migration/schema';

export const AdminSystemMigrationsPath: OpenAPIPath = {
  '/admin/migrations/list': {
    get: {
      summary: '获取升级脚本列表',
      description: '获取所有升级脚本的有序注册信息及最新运行状态',
      tags: [DevApiTagsMap.adminSystemMigration],
      responses: {
        200: {
          description: '成功获取升级脚本列表',
          content: {
            'application/json': {
              schema: SystemMigrationListResponseSchema
            }
          }
        }
      }
    }
  },
  '/admin/migrations/failedRecords': {
    get: {
      summary: '获取升级脚本失败记录',
      description: '按需获取指定升级脚本中某个阶段最近一次失败的逐条错误数据',
      tags: [DevApiTagsMap.adminSystemMigration],
      requestParams: {
        query: GetSystemMigrationFailedRecordsQuerySchema
      },
      responses: {
        200: {
          description: '成功获取失败记录',
          content: {
            'application/json': {
              schema: SystemMigrationFailedRecordsResponseSchema
            }
          }
        }
      }
    }
  },
  '/admin/migrations/retry': {
    post: {
      summary: '重试非阻塞升级脚本',
      description: '将失败的非阻塞升级脚本恢复为待执行状态，由 Runner 重新竞争 lease',
      tags: [DevApiTagsMap.adminSystemMigration],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: RetrySystemMigrationBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '升级脚本已重新加入执行队列'
        }
      }
    }
  }
};
