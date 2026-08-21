import type { OpenAPIPath } from '../../type';
import { DevApiTagsMap } from '../../tag';
import {
  PresignAvatarPostUrlBodySchema,
  PresignAvatarPostUrlResponseSchema,
  PresignTempFilePostUrlBodySchema,
  PresignTempFilePostUrlResponseSchema,
  ReadCommonFilePathSchema,
  ReadCommonFileQuerySchema,
  ReadCommonFileResponseSchema
} from './api';

export const CommonFilePath: OpenAPIPath = {
  '/common/file/presignAvatarPostUrl': {
    post: {
      summary: '获取头像上传预签名 URL',
      description: '为当前团队生成头像文件上传预签名 URL',
      tags: [DevApiTagsMap.commonFile],
      requestBody: {
        content: {
          'application/json': {
            schema: PresignAvatarPostUrlBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回头像文件上传参数',
          content: {
            'application/json': {
              schema: PresignAvatarPostUrlResponseSchema
            }
          }
        }
      }
    }
  },
  '/common/file/presignTempFilePostUrl': {
    post: {
      summary: '获取临时文件上传预签名 URL',
      description: '为当前团队生成一小时有效的临时文件上传预签名 URL',
      tags: [DevApiTagsMap.commonFile],
      requestBody: {
        content: {
          'application/json': {
            schema: PresignTempFilePostUrlBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回临时文件上传参数',
          content: {
            'application/json': {
              schema: PresignTempFilePostUrlResponseSchema
            }
          }
        }
      }
    }
  },
  '/common/file/read/{filename}': {
    get: {
      summary: '读取文件',
      description: '使用文件访问 token 预览或下载知识库文件',
      tags: [DevApiTagsMap.commonFile],
      requestParams: {
        path: ReadCommonFilePathSchema,
        query: ReadCommonFileQuerySchema
      },
      responses: {
        200: {
          description: '成功返回文件内容',
          content: {
            'application/octet-stream': {
              schema: ReadCommonFileResponseSchema
            }
          }
        }
      }
    },
    head: {
      summary: '获取文件元数据',
      description: '使用文件访问 token 获取文件类型、长度和下载方式等响应头',
      tags: [DevApiTagsMap.commonFile],
      requestParams: {
        path: ReadCommonFilePathSchema,
        query: ReadCommonFileQuerySchema
      },
      responses: {
        200: {
          description: '成功返回文件响应头'
        }
      }
    }
  }
};
