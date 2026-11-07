import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  GetSystemMigrationFailedRecordsQuerySchema,
  RetrySystemMigrationBodySchema,
  StartSystemMigrationBodySchema,
  SystemMigrationFailedRecordsResponseSchema,
  SystemMigrationListResponseSchema
} from '../../../../migration/schema';

export const AdminSystemMigrationsPath: OpenAPIPath = {
  '/admin/migrations/list': {
    get: {
      summary: '获取升级脚本列表',
      description: '获取所有升级脚本的有序注册信息、有效启动阻塞模式及最新运行状态',
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
      summary: '重试升级脚本',
      description:
        '将失败的后台升级脚本恢复为待执行状态，由 Runner 重新竞争 lease；启动链任务须通过日志排障并重启持有租约的 App 节点恢复',
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
  },
  '/admin/migrations/start': {
    post: {
      summary: '手动执行升级脚本',
      description: '将等待管理员确认的手动脚本加入队列，由 Runner 获取 lease 执行',
      tags: [DevApiTagsMap.adminSystemMigration],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: StartSystemMigrationBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '升级脚本已加入执行队列'
        }
      }
    }
  }
};
