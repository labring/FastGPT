import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  DatasetSynonymJobActionBodySchema,
  DatasetSynonymJobActionResponseSchema,
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
      description: '提交完整 mappings 列表并创建增量索引任务，数据仅存储在 MongoDB',
      tags: [DevApiTagsMap.datasetSynonym],
      requestBody: { content: { 'application/json': { schema: UploadDatasetSynonymBodySchema } } },
      responses: {
        200: {
          description: '成功创建同义词任务',
          content: { 'application/json': { schema: DatasetSynonymMutationResponseSchema } }
        }
      }
    }
  },
  '/core/dataset/synonym/uploadFile': {
    post: {
      summary: '直接上传知识库同义词文件',
      description: '直接解析 CSV/XLS/XLSX 请求文件并将版本化 mappings 存入 MongoDB',
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
          description: '成功创建同义词任务',
          content: { 'application/json': { schema: DatasetSynonymMutationResponseSchema } }
        }
      }
    }
  },
  '/core/dataset/synonym/update': {
    post: {
      summary: '更新知识库同义词文件',
      description: '比较当前 active 版本与完整 mappings 列表并创建增量索引任务',
      tags: [DevApiTagsMap.datasetSynonym],
      requestBody: { content: { 'application/json': { schema: UpdateDatasetSynonymBodySchema } } },
      responses: {
        200: {
          description: '成功创建同义词更新任务',
          content: { 'application/json': { schema: DatasetSynonymMutationResponseSchema } }
        }
      }
    }
  },
  '/core/dataset/synonym/updateFile': {
    post: {
      summary: '直接更新知识库同义词文件',
      description: '直接解析 CSV/XLS/XLSX 请求文件，与 active 版本比较后创建增量任务',
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
          description: '成功创建同义词更新任务',
          content: { 'application/json': { schema: DatasetSynonymMutationResponseSchema } }
        }
      }
    }
  },
  '/core/dataset/synonym/detail': {
    get: {
      summary: '获取知识库同义词配置',
      description: '返回当前文件配置和最近一个后台任务',
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
      description: '创建恢复原文索引的后台任务，任务完成前旧配置继续生效',
      tags: [DevApiTagsMap.datasetSynonym],
      requestParams: { query: DeleteDatasetSynonymQuerySchema },
      responses: {
        200: {
          description: '成功创建同义词删除任务',
          content: { 'application/json': { schema: DeleteDatasetSynonymResponseSchema } }
        }
      }
    }
  },
  '/core/dataset/synonym/download': {
    get: {
      summary: '下载知识库同义词文件',
      description: '校验知识库读取权限后，根据当前 active mappings 动态生成 UTF-8 CSV',
      tags: [DevApiTagsMap.datasetSynonym],
      requestParams: { query: DownloadDatasetSynonymQuerySchema },
      responses: { 200: { description: '同义词原始文件流' } }
    }
  },
  '/core/dataset/synonym/mappings': {
    post: {
      summary: '分页搜索当前同义词 mappings',
      description: '按标准词和同义词文本搜索当前 active 版本',
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
  },
  '/core/dataset/synonym/retry': {
    post: {
      summary: '重试失败的同义词任务',
      description: '基于失败任务保留的 Mongo mapping 快照创建新的可审计版本和后台任务',
      tags: [DevApiTagsMap.datasetSynonym],
      requestBody: {
        content: { 'application/json': { schema: DatasetSynonymJobActionBodySchema } }
      },
      responses: {
        200: {
          description: '成功创建重试任务',
          content: { 'application/json': { schema: DatasetSynonymMutationResponseSchema } }
        }
      }
    }
  },
  '/core/dataset/synonym/cancel': {
    post: {
      summary: '取消同义词任务',
      description: '仅允许取消尚未产生向量写入的任务',
      tags: [DevApiTagsMap.datasetSynonym],
      requestBody: {
        content: { 'application/json': { schema: DatasetSynonymJobActionBodySchema } }
      },
      responses: {
        200: {
          description: '取消成功',
          content: { 'application/json': { schema: DatasetSynonymJobActionResponseSchema } }
        }
      }
    }
  }
};
