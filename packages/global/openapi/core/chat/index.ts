import type { OpenAPIPath } from '../../type';
import { ChatSettingPath } from './setting';
import { ChatFavouriteAppPath } from './favourite/index';
import { ChatFeedbackPath } from './feedback/index';
import { ChatHistoryPath } from './history/index';
import { z } from 'zod';
import { CreatePostPresignedUrlResultSchema } from '../../../../service/common/s3/type';
import { PresignChatFileGetUrlSchema, PresignChatFilePostUrlSchema } from './api';
import { TagsMap } from '../../tag';

export const ChatPath: OpenAPIPath = {
  ...ChatSettingPath,
  ...ChatFavouriteAppPath,
  ...ChatFeedbackPath,
  ...ChatHistoryPath,

  '/core/chat/presignChatFilePostUrl': {
    post: {
      summary: '获取文件上传 URL',
      description: '获取文件上传 URL',
      tags: [TagsMap.chatPage],
      requestBody: {
        content: {
          'application/json': {
            schema: PresignChatFilePostUrlSchema
          }
        }
      },
      responses: {
        200: {
          description: '成功上传对话文件预签名 URL',
          content: {
            'application/json': {
              schema: CreatePostPresignedUrlResultSchema
            }
          }
        }
      }
    }
  },
  '/core/chat/presignChatFileGetUrl': {
    post: {
      summary: '获取文件预览地址',
      description: '获取文件预览地址',
      tags: [TagsMap.chatPage],
      requestBody: {
        content: {
          'application/json': {
            schema: PresignChatFileGetUrlSchema
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
