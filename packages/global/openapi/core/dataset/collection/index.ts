import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import { SystemOpenApiTagMap } from '../../../tag';
import {
  ChangeCollectionOwnerBodySchema,
  ChangeCollectionOwnerResponseSchema,
  DeleteCollectionBodySchema,
  DeleteCollectionQuerySchema,
  ExportCollectionBodyRawSchema,
  GetCollectionCollaboratorListQuerySchema,
  GetCollectionCollaboratorListResponseSchema,
  GetCollectionDetailQuerySchema,
  GetCollectionPathsQuerySchema,
  GetCollectionTrainingDetailQuerySchema,
  GetCollectionTrainingDetailResponseSchema,
  ListCollectionV2BodySchema,
  GetTagFilterOptionsQuerySchema,
  GetTagFilterOptionsResponseSchema,
  ReadCollectionSourceBodyRawSchema,
  ResumeCollectionInheritPermissionBodySchema,
  SyncCollectionBodySchema,
  UpdateCollectionCollaboratorBodySchema,
  UpdateCollectionCollaboratorResponseSchema,
  UpdateDatasetCollectionBodySchema
} from './api';
import { DatasetCollectionCreatePath } from './createPath';
import {
  BatchDownloadDatasetCollectionsQuerySchema,
  GetDownloadTicketDatasetCollectionsBodySchema,
  GetDownloadTicketDatasetCollectionsResponseSchema,
  BatchDownloadDatasetCollectionsResponseSchema
} from './batchDownloadApi';

export const DatasetCollectionPath: OpenAPIPath = {
  ...DatasetCollectionCreatePath,
  '/core/dataset/collection/getDownloadTicket': {
    post: {
      summary: '申请知识库集合批量下载凭证',
      description: '校验并准备通用知识库集合批量下载所需的短效一次性凭证',
      tags: [DevApiTagsMap.datasetCollection, SystemOpenApiTagMap.datasetCollection],
      requestBody: {
        content: {
          'application/json': {
            schema: GetDownloadTicketDatasetCollectionsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回短效一次性下载凭证',
          content: {
            'application/json': {
              schema: GetDownloadTicketDatasetCollectionsResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/dataset/collection/batchDownload': {
    get: {
      summary: '下载知识库集合归档文件',
      description: '使用短效凭证将预检后的集合原始文件流式归档为 ZIP 文件',
      tags: [DevApiTagsMap.datasetCollection, SystemOpenApiTagMap.datasetCollection],
      requestParams: {
        query: BatchDownloadDatasetCollectionsQuerySchema
      },
      responses: {
        200: {
          description: '成功返回 ZIP 归档文件流',
          content: {
            'application/zip': {
              schema: BatchDownloadDatasetCollectionsResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/dataset/collection/delete': {
    post: {
      'x-required-parameter-alternatives': [
        [{ in: 'query', name: 'id' }],
        [{ in: 'body', name: 'collectionIds' }]
      ],
      summary: '删除集合',
      description:
        '删除一个或多个集合及其子集合，支持通过 query.id 或 body.collectionIds 指定。仅集合所有者（owner）可删除；持有 manage/write 权限的协作者不可删除',
      tags: [DevApiTagsMap.datasetCollection, SystemOpenApiTagMap.datasetCollection],
      requestParams: {
        query: DeleteCollectionQuerySchema
      },
      requestBody: {
        content: {
          'application/json': {
            schema: DeleteCollectionBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功删除集合'
        }
      }
    }
  },
  '/core/dataset/collection/detail': {
    get: {
      summary: '获取集合详情',
      description:
        '获取集合详细信息，包括索引数量、错误数量、文件信息等。需要所属数据集读权限与集合读权限',
      tags: [DevApiTagsMap.datasetCollection, SystemOpenApiTagMap.datasetCollection],
      requestParams: {
        query: GetCollectionDetailQuerySchema
      },
      responses: {
        200: {
          description: '成功返回集合详情'
        }
      }
    }
  },
  '/core/dataset/collection/listV2': {
    post: {
      summary: '获取集合列表（分页）',
      description:
        '获取数据集集合列表，支持分页、搜索、标签过滤。需要数据集读权限；传入 parentId 时同时校验该文件夹读权限。知识库开启文件级权限后，列表按当前成员逐条可读的集合过滤，并返回每个集合的有效权限',
      tags: [DevApiTagsMap.datasetCollection, SystemOpenApiTagMap.datasetCollection],
      requestBody: {
        content: {
          'application/json': {
            schema: ListCollectionV2BodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回集合列表和总数'
        }
      }
    }
  },
  '/core/dataset/collection/tagFilterOptions': {
    get: {
      summary: '获取知识库标签筛选项',
      description: '获取知识库下当前已被文件使用的标签值',
      tags: [DevApiTagsMap.datasetCollection],
      requestParams: {
        query: GetTagFilterOptionsQuerySchema
      },
      responses: {
        200: {
          description: '成功返回标签及已用值列表',
          content: {
            'application/json': {
              schema: GetTagFilterOptionsResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/dataset/collection/update': {
    post: {
      summary: '更新数据集集合信息',
      description:
        '更新数据集集合信息，支持通过集合ID或数据集ID+外部文件ID定位集合。需要集合写权限；变更 parentId 视为移动，源父级与目标父级均需管理权限（根目录与文件夹之间移动还需团队知识库创建权限），且不接受 inheritPermission，独立态保持独立、继承态保持继承',
      tags: [DevApiTagsMap.datasetCollection, SystemOpenApiTagMap.datasetCollection],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateDatasetCollectionBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新集合信息'
        }
      }
    }
  },
  '/proApi/core/dataset/collection/changeOwner': {
    post: {
      summary: '转让集合所有权',
      description:
        '将集合（含其 parentId 子树）的所有权转让给指定团队成员，同步更新集合文档 owner 与权限记录。需要集合所有者权限',
      tags: [DevApiTagsMap.permissionResource, DevApiTagsMap.datasetPermission],
      requestBody: {
        content: {
          'application/json': {
            schema: ChangeCollectionOwnerBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功转让集合所有权',
          content: {
            'application/json': {
              schema: ChangeCollectionOwnerResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/core/dataset/collection/collaborator/list': {
    get: {
      summary: '获取集合协作者列表',
      description:
        '获取集合协作者列表，同时返回跨类型父级的协作者：根集合的父级为所属知识库，非根集合的父级为父文件夹快照。需要集合读权限',
      tags: [DevApiTagsMap.permissionCollaborator, DevApiTagsMap.datasetPermission],
      requestParams: {
        query: GetCollectionCollaboratorListQuerySchema
      },
      responses: {
        200: {
          description: '成功获取集合协作者列表',
          content: {
            'application/json': {
              schema: GetCollectionCollaboratorListResponseSchema
            }
          }
        }
      }
    }
  },
  '/proApi/core/dataset/collection/collaborator/update': {
    post: {
      summary: '更新集合协作者',
      description:
        '全量覆盖更新集合的协作者权限（必须携带当前集合 owner）。继承态集合若改动父级协作者会自动转为独立态并同步子树，需集合管理权限。所属知识库未开启文件级权限时拒绝',
      tags: [DevApiTagsMap.permissionCollaborator, DevApiTagsMap.datasetPermission],
      requestBody: {
        content: {
          'application/json': {
            schema: UpdateCollectionCollaboratorBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功更新集合协作者',
          content: {
            'application/json': {
              schema: UpdateCollectionCollaboratorResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/dataset/collection/resumeInheritPermission': {
    put: {
      summary: '恢复集合继承权限',
      description:
        '将集合从独立态恢复为继承态：保留相对当前父级独有的权限位后重新合并父级权限，同步子树。需要集合管理权限且所属知识库已开启文件级权限',
      tags: [DevApiTagsMap.datasetPermission],
      requestBody: {
        content: {
          'application/json': {
            schema: ResumeCollectionInheritPermissionBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功恢复集合继承权限'
        }
      }
    }
  },
  '/core/dataset/collection/paths': {
    get: {
      summary: '获取集合面包屑路径',
      description: '从指定集合向上递归获取父级路径链，用于面包屑导航',
      tags: [DevApiTagsMap.datasetCollection],
      requestParams: {
        query: GetCollectionPathsQuerySchema
      },
      responses: {
        200: {
          description: '成功返回路径列表'
        }
      }
    }
  },
  '/core/dataset/collection/read': {
    post: {
      summary: '获取集合资源 URL',
      description: '获取集合原始文件的访问 URL，支持直接鉴权和对话中鉴权两种模式',
      tags: [DevApiTagsMap.datasetCollection],
      requestBody: {
        content: {
          'application/json': {
            schema: ReadCollectionSourceBodyRawSchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回资源 URL'
        }
      }
    }
  },
  '/core/dataset/collection/sync': {
    post: {
      summary: '同步集合',
      description: '重新拉取集合原始内容并更新数据，支持链接类型和 API 数据集类型',
      tags: [DevApiTagsMap.datasetCollection],
      requestBody: {
        content: {
          'application/json': {
            schema: SyncCollectionBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回同步结果（success / sameRaw / failed）'
        }
      }
    }
  },
  '/core/dataset/collection/export': {
    post: {
      summary: '下载集合的所有数据块',
      description: '下载集合的所有数据块',
      tags: [DevApiTagsMap.datasetCollection],
      requestBody: {
        content: {
          'application/json': {
            schema: ExportCollectionBodyRawSchema
          }
        }
      },
      responses: {
        200: {
          description: '成功导出并下载集合的所有数据块内容'
        }
      }
    }
  },
  '/core/dataset/collection/trainingDetail': {
    get: {
      summary: '获取集合训练详情',
      description: '获取集合的训练状态，包括排队中、训练中、错误数量及已完成的数据量',
      tags: [DevApiTagsMap.datasetCollection],
      requestParams: {
        query: GetCollectionTrainingDetailQuerySchema
      },
      responses: {
        200: {
          description: '成功返回训练详情',
          content: {
            'application/json': {
              schema: GetCollectionTrainingDetailResponseSchema
            }
          }
        }
      }
    }
  }
};
