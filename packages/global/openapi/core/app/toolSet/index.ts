import type { OpenAPIPath } from '../../../type';
import { DevApiTagsMap } from '../../../tag';
import { ListToolSetV2BodySchema, ListToolSetV2ResponseSchema } from './api';

export const ToolSetPath: OpenAPIPath = {
  '/core/app/toolSet/listV2': {
    post: {
      summary: '分页获取工具集子工具',
      description: '分页获取 MCP 或 HTTP 工具集下当前用户可读取的工具',
      tags: [DevApiTagsMap.mcpTools, DevApiTagsMap.httpTools],
      requestBody: {
        content: {
          'application/json': {
            schema: ListToolSetV2BodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取分页工具列表',
          content: {
            'application/json': {
              schema: ListToolSetV2ResponseSchema
            }
          }
        }
      }
    }
  }
};
