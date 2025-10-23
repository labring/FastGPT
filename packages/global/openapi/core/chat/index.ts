import { ChatSettingPath } from './setting';
import { ChatFavouriteAppPath } from './favourite/index';
import { z } from 'zod';
import { ObjectIdSchema } from '../../../common/type/mongo';
import { CreatePostPresignedUrlResultSchema } from '../../../../service/common/s3/type';

export const ChatPath = {
  ...ChatSettingPath,
  ...ChatFavouriteAppPath,

  '/proApi/core/chat/presignChatFileGetUrl': {
    post: {
      summary: '获取对话文件预签名 URL',
      description: '获取对话文件的预签名 URL',
      tags: ['对话页'],
      requestBody: {
        content: {
          'application/json': {
            schema: z.object({
              key: z.string().min(1),
              appId: ObjectIdSchema,
              outLinkAuthData: z.record(z.string(), z.any())
            })
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
  '/proApi/core/chat/presignChatFilePostUrl': {
    post: {
      summary: '上传对话文件预签名 URL',
      description: '上传对话文件的预签名 URL',
      tags: ['对话页'],
      requestBody: {
        content: {
          'application/json': {
            schema: z.object({
              filename: z.string().min(1),
              appId: ObjectIdSchema,
              chatId: ObjectIdSchema,
              outLinkAuthData: z.record(z.string(), z.any())
            })
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
