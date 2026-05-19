import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  GetSearchTestImagePreviewUrlsBodySchema,
  GetSearchTestImagePreviewUrlsResponseSchema,
  GetPreviewChunksBodySchema,
  GetPreviewChunksResponseSchema,
  PresignDatasetFilePostUrlBodySchema,
  PresignDatasetFilePostUrlResponseSchema,
  PresignSearchTestImageBodySchema,
  PresignSearchTestImageResponseSchema
} from './api';

export const DatasetFilePath: OpenAPIPath = {
  '/core/dataset/file/getPreviewChunks': {
    post: {
      summary: '预览文件分块',
      description: '读取数据源并按给定分块参数预览生成的前 10 个分块，用于导入前校验',
      tags: [TagsMap.datasetFile],
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
  '/core/dataset/file/presignDatasetFilePostUrl': {
    post: {
      summary: '获取知识库文件上传预签名 URL',
      description: '为指定知识库生成 S3 上传预签名 URL，同时校验写权限并对上传频率进行限制',
      tags: [TagsMap.datasetFile],
      requestBody: {
        content: {
          'application/json': {
            schema: PresignDatasetFilePostUrlBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回预签名上传 URL、key、请求头和最大文件大小',
          content: {
            'application/json': {
              schema: PresignDatasetFilePostUrlResponseSchema
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
      tags: [TagsMap.datasetFile],
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
      tags: [TagsMap.datasetFile],
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
