import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import { PresignChatFilePostUrlRawSchema, PresignChatFileGetUrlRawSchema } from './api';
import { CreatePostPresignedUrlResponseSchema } from '../../../../common/file/s3/type';
import { z } from 'zod';

export const ChatFilePath: OpenAPIPath = {
  '/core/chat/file/presignChatFilePostUrl': {
    post: {
      summary: '获取文件上传 URL',
      description: '获取文件上传 URL',
      tags: [DevApiTagsMap.chatFile],
      requestBody: {
        content: {
          'application/json': {
            schema: PresignChatFilePostUrlRawSchema
          }
        }
      },
      responses: {
        200: {
          description: '成功上传对话文件预签名 URL',
          content: {
            'application/json': {
              schema: CreatePostPresignedUrlResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/chat/file/presignChatFileGetUrl': {
    post: {
      summary: '获取文件预览地址',
      description: '获取文件预览地址',
      tags: [DevApiTagsMap.chatFile],
      requestBody: {
        content: {
          'application/json': {
            schema: PresignChatFileGetUrlRawSchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取对话文件预签名 URL',
          content: {
            'application/json': {
              schema: z.string()
            }
          }
        }
      }
    }
  }
};
