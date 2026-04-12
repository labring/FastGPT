import { TagsMap } from '../../../tag';
import type { OpenAPIPath } from '../../../type';
import {
  CreateApiCollectionBodySchema,
  CreateApiCollectionV2BodySchema,
  CreateBackupCollectionMultipartSchema,
  CreateCollectionBodySchema,
  CreateCollectionByFileIdBodySchema,
  CreateCollectionByLocalFileFormSchema,
  CreateImageCollectionMultipartSchema,
  CreateLinkCollectionBodySchema,
  CreateTemplateCollectionMultipartSchema,
  CreateTextCollectionBodySchema,
  ReTrainingCollectionBodySchema
} from './createApi';

export const DatasetCollectionCreatePath: OpenAPIPath = {
  /* ============================================================
   * 通用创建（直接写入集合记录，不触发训练）
   * ============================================================ */
  '/core/dataset/collection/create': {
    post: {
      summary: '创建空集合/目录',
      description: '创建空数据集合或者目录',
      tags: [TagsMap.dastasetCollectionCreate],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateCollectionBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回新创建的集合 ID'
        }
      }
    }
  },

  /* ============================================================
   * 重新训练已有集合
   * ============================================================ */
  '/core/dataset/collection/create/reTrainingCollection': {
    post: {
      summary: '重新训练集合',
      description: '删除原集合并以新参数重新创建并训练，适用于调整分块策略后的重处理场景',
      tags: [TagsMap.dastasetCollectionCreate],
      requestBody: {
        content: {
          'application/json': {
            schema: ReTrainingCollectionBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回新集合 ID'
        }
      }
    }
  },

  /* ============================================================
   * 通过已上传的文件 ID 创建集合
   * ============================================================ */
  '/core/dataset/collection/create/fileId': {
    post: {
      summary: '通过文件 ID 创建集合',
      description: '使用已上传至 S3 的文件对象键创建集合并触发训练',
      tags: [TagsMap.dastasetCollectionCreate],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateCollectionByFileIdBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回集合 ID 及数据插入结果'
        }
      }
    }
  },

  /* ============================================================
   * 上传本地文件创建集合（multipart/form-data）
   * ============================================================ */
  '/core/dataset/collection/create/localFile': {
    post: {
      summary: '上传本地文件创建集合',
      description:
        '通过 multipart/form-data 上传文件，自动存储至 S3 后创建集合并触发训练。`file` 字段为二进制文件，`data` 字段为 JSON 序列化的集合参数对象',
      tags: [TagsMap.dastasetCollectionCreate],
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: CreateCollectionByLocalFileFormSchema,
            encoding: {
              data: { contentType: 'application/json' }
            }
          }
        }
      },
      responses: {
        200: {
          description: '成功返回集合 ID 及数据插入结果'
        }
      }
    }
  },

  /* ============================================================
   * 通过链接创建集合
   * ============================================================ */
  '/core/dataset/collection/create/link': {
    post: {
      summary: '通过链接创建集合',
      description: '抓取指定 URL 内容创建集合并触发训练',
      tags: [TagsMap.dastasetCollectionCreate],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateLinkCollectionBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回集合 ID 及数据插入结果'
        }
      }
    }
  },

  /* ============================================================
   * 通过文本创建集合
   * ============================================================ */
  '/core/dataset/collection/create/text': {
    post: {
      summary: '通过文本创建集合',
      description: '将文本内容存储为文件后创建集合并触发训练',
      tags: [TagsMap.dastasetCollectionCreate],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateTextCollectionBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回集合 ID 及数据插入结果'
        }
      }
    }
  },

  /* ============================================================
   * 通过 API 数据集创建集合（V1，单文件）
   * ============================================================ */
  '/core/dataset/collection/create/apiCollection': {
    post: {
      summary: '通过 API 数据集创建集合（V1）',
      description: '根据 apiFileId 从第三方 API 数据源拉取单个文件并创建集合',
      deprecated: true,
      tags: [TagsMap.dastasetCollectionCreate],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateApiCollectionBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功创建集合'
        }
      }
    }
  },

  /* ============================================================
   * 通过 API 数据集创建集合（V2，批量/文件夹递归）
   * ============================================================ */
  '/core/dataset/collection/create/apiCollectionV2': {
    post: {
      summary: '通过 API 数据集批量创建集合（V2）',
      description: '支持传入文件列表或选择根目录，递归拉取 API 数据源文件并批量创建集合',
      tags: [TagsMap.dastasetCollectionCreate],
      requestBody: {
        content: {
          'application/json': {
            schema: CreateApiCollectionV2BodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功批量创建集合'
        }
      }
    }
  },

  /* ============================================================
   * 上传图片集创建集合（multipart/form-data）
   * ============================================================ */
  '/core/dataset/collection/create/images': {
    post: {
      summary: '上传图片集创建集合',
      description:
        '通过 multipart/form-data 批量上传图片，使用 VLM 模型解析后创建集合。`file` 为多个图片文件（多选），`data` 为 JSON 序列化的集合参数对象',
      tags: [TagsMap.dastasetCollectionCreate],
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: CreateImageCollectionMultipartSchema,
            encoding: {
              data: { contentType: 'application/json' }
            }
          }
        }
      },
      responses: {
        200: {
          description: '成功返回集合 ID 及数据插入结果'
        }
      }
    }
  },

  /* ============================================================
   * 导入备份 CSV 文件创建集合（multipart/form-data）
   * ============================================================ */
  '/core/dataset/collection/create/backup': {
    post: {
      summary: '导入备份 CSV 创建集合',
      description:
        '上传格式为 q,a,indexes 的 CSV 备份文件，恢复数据到知识库集合。`file` 为 CSV 文件，`data` 为 JSON 序列化的集合参数对象',
      tags: [TagsMap.dastasetCollectionCreate],
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: CreateBackupCollectionMultipartSchema,
            encoding: {
              data: { contentType: 'application/json' }
            }
          }
        }
      },
      responses: {
        200: {
          description: '成功导入备份数据'
        }
      }
    }
  },

  /* ============================================================
   * 导入模板 CSV 文件创建集合（multipart/form-data）
   * ============================================================ */
  '/core/dataset/collection/create/template': {
    post: {
      summary: '导入模板 CSV 创建集合',
      description:
        '上传格式为 q,a,indexes 的 CSV 模板文件，批量导入数据到知识库集合。`file` 为 CSV 文件，`data` 为 JSON 序列化的集合参数对象',
      tags: [TagsMap.dastasetCollectionCreate],
      requestBody: {
        content: {
          'multipart/form-data': {
            schema: CreateTemplateCollectionMultipartSchema,
            encoding: {
              data: { contentType: 'application/json' }
            }
          }
        }
      },
      responses: {
        200: {
          description: '成功导入模板数据'
        }
      }
    }
  }
};
