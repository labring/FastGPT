import type { OpenAPIPath } from '../../type';
import { ChatSettingPath } from './setting';
import { ChatFavouriteAppPath } from './favourite/index';
import { z } from 'zod';
import { CreatePostPresignedUrlResultSchema } from '../../../../service/common/s3/type';
import { PresignChatFileGetUrlSchema, PresignChatFilePostUrlSchema } from '../../../core/chat/api';
import { TagsMap } from '../../tag';

export const ChatPath: OpenAPIPath = {
  ...ChatSettingPath,
  ...ChatFavouriteAppPath,

  '/core/chat/presignChatFileGetUrl': {
    post: {
      summary: '获取对话文件预签名 URL',
      description: '获取对话文件的预签名 URL',
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
  },
  '/core/chat/presignChatFilePostUrl': {
    post: {
      summary: '上传对话文件预签名 URL',
      description: '上传对话文件的预签名 URL',
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
  }
};
