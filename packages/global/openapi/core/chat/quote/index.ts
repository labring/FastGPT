import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  GetQuoteBodySchema,
  GetQuoteResponseSchema,
  GetCollectionQuoteBodySchema,
  GetCollectionQuoteResSchema
} from './api';

export const ChatQuotePath: OpenAPIPath = {
  '/core/chat/quote/getQuote': {
    post: {
      summary: '获取对话引用数据',
      description: '获取指定对话消息的数据集引用列表，需要对话访问权限',
      tags: [TagsMap.chatPage],
      requestBody: {
        content: {
          'application/json': {
            schema: GetQuoteBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回引用数据列表',
          content: {
            'application/json': {
              schema: GetQuoteResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/chat/quote/getCollectionQuote': {
    post: {
      summary: '获取集合分页引用数据',
      description: '以链式分页方式获取指定集合的引用数据，支持前后翻页，需要对话访问权限',
      tags: [TagsMap.chatPage],
      requestBody: {
        content: {
          'application/json': {
            schema: GetCollectionQuoteBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功返回分页引用数据',
          content: {
            'application/json': {
              schema: GetCollectionQuoteResSchema
            }
          }
        }
      }
    }
  }
};
