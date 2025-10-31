import { z } from 'zod';
import { type OpenAPIPath } from '../../type';
import { ApiKeyHealthParamsSchema, ApiKeyHealthResponseSchema } from './api';
import { TagsMap } from '../../tag';

export const ApiKeyPath: OpenAPIPath = {
  '/support/openapi/health': {
    get: {
      summary: '检查 API Key 是否健康',
      tags: [TagsMap.apiKey],
      requestParams: {
        query: ApiKeyHealthParamsSchema
      },
      responses: {
        200: {
          description: 'API Key 可用',
          content: {
            'application/json': {
              schema: ApiKeyHealthResponseSchema
            }
          }
        },
        500: {
          description: 'ApiKey错误',
          content: {
            'application/json': {
              schema: z.object({ message: z.literal('APIKey invalid') })
            }
          }
        }
      }
    }
  }
};
