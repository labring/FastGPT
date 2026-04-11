import type { OpenAPIPath } from '../../type';
import { TagsMap } from '../../tag';
import { DatasetDataPath } from './data';
import { DatasetCollectionPath } from './collection';
import { ApiDatasetPath } from './apiDataset';
import {
  CreateDatasetBodySchema,
  CreateDatasetWithFilesBodySchema,
  DeleteDatasetQuerySchema,
  GetDatasetDetailQuerySchema,
  GetDatasetListBodySchema,
  GetDatasetPathsQuerySchema,
  UpdateDatasetBodySchema,
  ResumeDatasetInheritPermissionBodySchema,
  CreateDatasetFolderBodySchema,
  SearchDatasetTestBodySchema,
  ExportDatasetQuerySchema
} from './api';

export const DatasetPath: OpenAPIPath = {
  '/core/dataset/create': {
    post: {
      summary: '创建知识库',
      description: '创建新的知识库,支持多种类型(普通知识库、文件夹、网站知识库等)',
      tags: [TagsMap.datasetCommon],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateDatasetBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回新创建的知识库 ID'
        }
      }
    }
  },
  '/core/dataset/createWithFiles': {
    post: {
      summary: '创建知识库并上传文件',
      description: '一步完成知识库创建和文件上传,自动创建集合并开始数据处理',
      tags: [TagsMap.datasetCommon],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateDatasetWithFilesBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回知识库信息和向量模型配置'
        }
      }
    }
  },
  '/core/dataset/folder/create': {
    post: {
      summary: '创建知识库文件夹',
      description: '创建知识库文件夹,用于组织和管理知识库',
      tags: [TagsMap.datasetCommon],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateDatasetFolderBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功创建文件夹'
        }
      }
    }
  },
  '/core/dataset/list': {
    post: {
      summary: '获取知识库列表',
      description: '获取当前用户有权限访问的知识库列表,支持按类型和关键词筛选',
      tags: [TagsMap.datasetCommon],
      requestBody: {
        content: {
          'application/json': {
            schema: GetDatasetListBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回知识库列表'
        }
      }
    }
  },
  '/core/dataset/paths': {
    get: {
      summary: '获取知识库路径',
      description: '获取知识库的父级路径链,用于面包屑导航',
      tags: [TagsMap.datasetCommon],
      requestParams: {
        query: GetDatasetPathsQuerySchema
      },
      responses: {
        200: {
          description: '成功返回路径列表'
        }
      }
    }
  },
  '/core/dataset/detail': {
    get: {
      summary: '获取知识库详情',
      description: '获取知识库详细信息,包括模型配置、权限和同步状态',
      tags: [TagsMap.datasetCommon],
      requestParams: {
        query: GetDatasetDetailQuerySchema
      },
      responses: {
        200: {
          description: '成功返回知识库详情'
        }
      }
    }
  },

  '/core/dataset/delete': {
    delete: {
      summary: '删除知识库',
      description: '删除知识库及其所有子知识库,需要所有者权限',
      tags: [TagsMap.datasetCommon],
      requestParams: {
        query: DeleteDatasetQuerySchema
      },
      responses: {
        200: {
          description: '成功删除知识库'
        }
      }
    }
  },
  '/core/dataset/update': {
    put: {
      summary: '更新知识库',
      description: '更新知识库信息、配置或移动知识库到其他目录',
      tags: [TagsMap.datasetCommon],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateDatasetBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新知识库'
        }
      }
    }
  },
  '/core/dataset/resumeInheritPermission': {
    put: {
      summary: '恢复知识库继承权限',
      description: '恢复知识库的继承权限,使其权限与父级保持一致',
      tags: [TagsMap.datasetCommon],
      requestBody: {
        content: {
          'application/json': {
            schema: ResumeDatasetInheritPermissionBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功恢复继承权限'
        }
      }
    }
  },

  '/core/dataset/searchTest': {
    post: {
      summary: '搜索测试',
      description: '对知识库执行搜索测试,支持多种搜索模式、重排序和问题扩展',
      tags: [TagsMap.datasetCommon],
      requestBody: {
        content: {
          'application/json': {
            schema: SearchDatasetTestBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回搜索结果列表及耗时信息'
        }
      }
    }
  },

  '/core/dataset/exportAll': {
    get: {
      summary: '导出知识库全部数据',
      description: '以流式 CSV 格式导出知识库及其所有子知识库的数据',
      tags: [TagsMap.datasetCommon],
      requestParams: {
        query: ExportDatasetQuerySchema
      },
      responses: {
        200: {
          description: '流式返回 CSV 文件'
        }
      }
    }
  },

  ...DatasetCollectionPath,
  ...DatasetDataPath,
  ...ApiDatasetPath
};
