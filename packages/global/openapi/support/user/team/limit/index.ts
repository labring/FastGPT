import type { OpenAPIPath } from '../../../../type';
import { DevApiTagsMap } from '../../../../tag';
import {
  DatasetSizeLimitQuerySchema,
  DatasetSizeLimitResponseSchema,
  ExportDatasetLimitQuerySchema,
  ExportDatasetLimitResponseSchema,
  WebSyncLimitQuerySchema,
  WebSyncLimitResponseSchema
} from './api';

export const TeamLimitPath: OpenAPIPath = {
  '/support/user/team/limit/datasetSizeLimit': {
    get: {
      summary: '检查团队知识库容量限制',
      description: '检查团队当前知识库索引容量和积分是否足以新增指定数量的数据',
      tags: [DevApiTagsMap.userLimit],
      requestParams: {
        query: DatasetSizeLimitQuerySchema
      },
      responses: {
        200: {
          description: '检查通过',
          content: {
            'application/json': {
              schema: DatasetSizeLimitResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/user/team/limit/exportDatasetLimit': {
    get: {
      summary: '检查团队知识库导出频率限制',
      description: '检查指定知识库是否具备导出权限，并校验团队导出冷却时间',
      tags: [DevApiTagsMap.userLimit],
      requestParams: {
        query: ExportDatasetLimitQuerySchema
      },
      responses: {
        200: {
          description: '检查通过',
          content: {
            'application/json': {
              schema: ExportDatasetLimitResponseSchema
            }
          }
        }
      }
    }
  },
  '/support/user/team/limit/webSyncLimit': {
    get: {
      summary: '检查团队站点同步频率限制',
      description: '检查当前团队是否已超过站点同步冷却时间',
      tags: [DevApiTagsMap.userLimit],
      requestParams: {
        query: WebSyncLimitQuerySchema
      },
      responses: {
        200: {
          description: '检查通过',
          content: {
            'application/json': {
              schema: WebSyncLimitResponseSchema
            }
          }
        }
      }
    }
  }
};
