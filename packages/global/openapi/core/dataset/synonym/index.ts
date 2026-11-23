import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  DatasetSynonymMutationResponseSchema,
  DeleteDatasetSynonymQuerySchema,
  DeleteDatasetSynonymResponseSchema,
  DownloadDatasetSynonymQuerySchema,
  GetDatasetSynonymDetailQuerySchema,
  GetDatasetSynonymDetailResponseSchema,
  SearchDatasetSynonymMappingsBodySchema,
  SearchDatasetSynonymMappingsResponseSchema,
  UpdateDatasetSynonymBodySchema,
  UpdateDatasetSynonymFileFormSchema,
  UploadDatasetSynonymBodySchema,
  UploadDatasetSynonymFileFormSchema
} from './api';

export const DatasetSynonymPath: OpenAPIPath = {
  '/core/dataset/synonym/upload': {
    post: {
      summary: '上传知识库同义词文件',
      description: '提交完整 mappings 列表，规则立即生效并通过现有训练队列重建历史数据',
      tags: [DevApiTagsMap.datasetSynonym],
      requestBody: { content: { 'application/json': { schema: UploadDatasetSynonymBodySchema } } },
      responses: {
        200: {
          description: '同义词配置已生效',
          content: { 'application/json': { schema: DatasetSynonymMutationResponseSchema } }
        }
      }
    }
  },
  '/core/dataset/synonym/uploadFile': {
    post: {
      summary: '直接上传知识库同义词文件',
      description: '直接解析 CSV/XLS/XLSX 请求文件，规则立即生效并重建历史数据',
      tags: [DevApiTagsMap.datasetSynonym],
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: UploadDatasetSynonymFileFormSchema,
            encoding: { data: { contentType: 'application/json' } }
          }
        }
      },
      responses: {
        200: {
          description: '同义词配置已生效',
          content: { 'application/json': { schema: DatasetSynonymMutationResponseSchema } }
        }
      }
    }
  },
  '/core/dataset/synonym/update': {
    post: {
      summary: '更新知识库同义词文件',
      description: '提交完整 mappings 列表，规则立即生效并通过现有训练队列重建历史数据',
      tags: [DevApiTagsMap.datasetSynonym],
      requestBody: { content: { 'application/json': { schema: UpdateDatasetSynonymBodySchema } } },
      responses: {
        200: {
          description: '同义词配置已更新',
          content: { 'application/json': { schema: DatasetSynonymMutationResponseSchema } }
        }
      }
    }
  },
  '/core/dataset/synonym/updateFile': {
    post: {
      summary: '直接更新知识库同义词文件',
      description: '直接解析 CSV/XLS/XLSX 请求文件，规则立即生效并重建历史数据',
      tags: [DevApiTagsMap.datasetSynonym],
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: UpdateDatasetSynonymFileFormSchema,
            encoding: { data: { contentType: 'application/json' } }
          }
        }
      },
      responses: {
        200: {
          description: '同义词配置已更新',
          content: { 'application/json': { schema: DatasetSynonymMutationResponseSchema } }
        }
      }
    }
  },
  '/core/dataset/synonym/detail': {
    get: {
      summary: '获取知识库同义词配置',
      description: '返回当前文件配置和向量重建进度',
      tags: [DevApiTagsMap.datasetSynonym],
      requestParams: { query: GetDatasetSynonymDetailQuerySchema },
      responses: {
        200: {
          description: '成功返回同义词配置',
          content: { 'application/json': { schema: GetDatasetSynonymDetailResponseSchema } }
        }
      }
    }
  },
  '/core/dataset/synonym/delete': {
    delete: {
      summary: '删除知识库同义词配置',
      description: '立即停用同义词规则，并通过现有训练队列重建历史数据的原文 embedding',
      tags: [DevApiTagsMap.datasetSynonym],
      requestParams: { query: DeleteDatasetSynonymQuerySchema },
      responses: {
        200: {
          description: '同义词配置已停用',
          content: { 'application/json': { schema: DeleteDatasetSynonymResponseSchema } }
        }
      }
    }
  },
  '/core/dataset/synonym/download': {
    get: {
      summary: '下载知识库同义词文件',
      description: '校验知识库读取权限后，根据当前生效 mappings 动态生成 UTF-8 CSV',
      tags: [DevApiTagsMap.datasetSynonym],
      requestParams: { query: DownloadDatasetSynonymQuerySchema },
      responses: { 200: { description: '同义词原始文件流' } }
    }
  },
  '/core/dataset/synonym/mappings': {
    post: {
      summary: '分页搜索当前同义词 mappings',
      description: '按标准词和同义词文本搜索当前生效版本',
      tags: [DevApiTagsMap.datasetSynonym],
      requestBody: {
        content: { 'application/json': { schema: SearchDatasetSynonymMappingsBodySchema } }
      },
      responses: {
        200: {
          description: '成功返回 mapping 分页结果',
          content: { 'application/json': { schema: SearchDatasetSynonymMappingsResponseSchema } }
        }
      }
    }
  }
};
