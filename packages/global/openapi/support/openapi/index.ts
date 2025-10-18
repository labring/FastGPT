import { z } from 'zod';
import { formatSuccessResponse, getErrorResponse, type OpenAPIPath } from '../../type';
import { ApiKeyHealthParamsSchema, ApiKeyHealthResponseSchema } from './api';

export const ApiKeyPath: OpenAPIPath = {
  '/support/openapi/health': {
    get: {
      summary: '检查 API Key 是否健康',
      tags: ['APIKey'],
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
