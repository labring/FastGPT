import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  GetSynonymListQuerySchema,
  GetSynonymListResponseSchema,
  DownloadSynonymQuerySchema,
  DeleteSynonymQuerySchema,
  UploadSynonymBodySchema
} from './api';

export const DatasetSynonymPath: OpenAPIPath = {
  '/core/dataset/synonym/upload': {
    post: {
      summary: '上传同义词文件',
      description:
        '上传同义词文件（CSV/XLSX/XLS），自动替换旧文件并触发标准化训练。注意：只支持单个同义词文件，第二次上传以最新为准，旧文件自动失效',
      tags: [TagsMap.datasetSynonym],
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: UploadSynonymBodySchema.extend({
              file: { type: 'string', format: 'binary' }
            })
          }
        }
      },
      responses: {
        200: { description: '上传成功' }
      }
    }
  },

  '/core/dataset/synonym/list': {
    get: {
      summary: '查询同义词文件列表',
      description: '查询知识库的同义词文件列表（按上传时间倒序），含上传者信息',
      tags: [TagsMap.datasetSynonym],
      requestParams: {
        query: GetSynonymListQuerySchema
      },
      responses: {
        200: {
          description: '成功返回同义词文件列表',
          content: { 'application/json': { schema: GetSynonymListResponseSchema } }
        }
      }
    }
  },

  '/core/dataset/synonym/download': {
    get: {
      summary: '下载同义词文件',
      description: '下载指定的同义词原文件（返回文件流）',
      tags: [TagsMap.datasetSynonym],
      requestParams: {
        query: DownloadSynonymQuerySchema
      },
      responses: {
        200: { description: '返回文件流' }
      }
    }
  },

  '/core/dataset/synonym/delete': {
    delete: {
      summary: '删除同义词文件',
      description: '删除同义词文件及其所有映射关系，同时清理 S3 文件',
      tags: [TagsMap.datasetSynonym],
      requestParams: {
        query: DeleteSynonymQuerySchema
      },
      responses: {
        200: { description: '删除成功' }
      }
    }
  }
};
