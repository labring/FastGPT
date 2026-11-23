import { z } from 'zod';
import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import {
  GetSearchTestImagePreviewUrlsBodySchema,
  GetSearchTestImagePreviewUrlsResponseSchema,
  GetPreviewChunksBodySchema,
  GetPreviewChunksResponseSchema,
  GetRawTextPreviewChunksBodySchema,
  AbortDatasetFileMultipartUploadResponseSchema,
  CompleteDatasetFileMultipartUploadBodySchema,
  CompleteDatasetFileMultipartUploadResponseSchema,
  DatasetFileUploadTokenPathSchema,
  PresignDatasetFilePostUrlBodySchema,
  PresignDatasetFilePostUrlResponseSchema,
  PresignSearchTestImageBodySchema,
  PresignSearchTestImageResponseSchema,
  UploadDatasetFileMultipartPartQuerySchema,
  UploadDatasetFileMultipartPartResponseSchema
} from './api';

export const DatasetFilePath: OpenAPIPath = {
  '/core/dataset/file/getPreviewChunks': {
    post: {
      summary: '预览文件分块',
      description: '读取数据源并按给定分块参数预览生成的前 10 个分块，用于导入前校验',
      tags: [DevApiTagsMap.datasetFile],
      requestBody: {
        content: {
          'application/json': {
            schema: GetPreviewChunksBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回预览分块列表及总数',
          content: {
            'application/json': {
              schema: GetPreviewChunksResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/dataset/file/getRawTextPreviewChunks': {
    post: {
      summary: '预览原始文本分块',
      description: '对前端已读取到的原始文本执行后端分块预览，用于自定义文件导入预览',
      tags: [DevApiTagsMap.datasetFile],
      requestBody: {
        content: {
          'application/json': {
            schema: GetRawTextPreviewChunksBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回预览分块列表及总数',
          content: {
            'application/json': {
              schema: GetPreviewChunksResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/dataset/file/presignDatasetFilePostUrl': {
    post: {
      summary: '获取知识库文件上传预签名 URL',
      description: '为指定知识库生成 S3 上传预签名 URL，同时校验写权限并对上传频率进行限制',
      tags: [DevApiTagsMap.datasetFile],
      requestBody: {
        content: {
          'application/json': {
            schema: PresignDatasetFilePostUrlBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回单 PUT 或 Multipart 上传参数',
          content: {
            'application/json': {
              schema: PresignDatasetFilePostUrlResponseSchema
            }
          }
        }
      }
    }
  },
  '/system/file/u/{token}': {
    put: {
      summary: '上传知识库文件 Multipart 分片',
      description: '通过 presign 返回的 token 代理上传单个 Multipart 分片',
      tags: [DevApiTagsMap.datasetFile],
      requestParams: {
        path: DatasetFileUploadTokenPathSchema,
        query: UploadDatasetFileMultipartPartQuerySchema.partial()
      },
      responses: {
        200: {
          description: '成功返回当前分片 ETag 或单 PUT 上传结果',
          content: {
            'application/json': {
              schema: z.union([
                UploadDatasetFileMultipartPartResponseSchema,
                z.object({ success: z.literal(true) })
              ])
            }
          }
        }
      }
    }
  },
  '/system/file/u/{token}/complete': {
    post: {
      summary: '完成知识库文件 Multipart 上传',
      description: '校验分片清单并合并生成最终对象',
      tags: [DevApiTagsMap.datasetFile],
      requestParams: {
        path: DatasetFileUploadTokenPathSchema
      },
      requestBody: {
        content: {
          'application/json': {
            schema: CompleteDatasetFileMultipartUploadBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功完成 Multipart 上传',
          content: {
            'application/json': {
              schema: CompleteDatasetFileMultipartUploadResponseSchema
            }
          }
        }
      }
    }
  },
  '/system/file/u/{token}/abort': {
    post: {
      summary: '取消知识库文件 Multipart 上传',
      description: '取消未完成的 Multipart 上传并清理对象存储分片',
      tags: [DevApiTagsMap.datasetFile],
      requestParams: {
        path: DatasetFileUploadTokenPathSchema
      },
      responses: {
        200: {
          description: '成功取消 Multipart 上传',
          content: {
            'application/json': {
              schema: AbortDatasetFileMultipartUploadResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/dataset/file/presignSearchTestImage': {
    post: {
      summary: '获取搜索测试图片上传预签名 URL',
      description: '获取搜索测试图片上传预签名 URL，仅支持图片文件，上传对象 3 小时后过期',
      tags: [DevApiTagsMap.datasetFile],
      requestBody: {
        content: {
          'application/json': {
            schema: PresignSearchTestImageBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回临时图片上传 URL、key 和缩略图预览 URL',
          content: {
            'application/json': {
              schema: PresignSearchTestImageResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/dataset/file/getSearchTestImagePreviewUrls': {
    post: {
      summary: '获取搜索测试图片预览 URL',
      description: '根据搜索测试历史中的临时图片 key 重新生成短期预览 URL',
      tags: [DevApiTagsMap.datasetFile],
      requestBody: {
        content: {
          'application/json': {
            schema: GetSearchTestImagePreviewUrlsBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回临时图片 key 和缩略图预览 URL 列表',
          content: {
            'application/json': {
              schema: GetSearchTestImagePreviewUrlsResponseSchema
            }
          }
        }
      }
    }
  }
};
