import type { OpenAPIPath } from '../../../type';
import { TagsMap } from '../../../tag';
import {
  GetPreviewNodeQueryOpenAPISchema,
  GetPreviewNodeResponseSchema,
  GetSystemToolTemplatesBodySchema,
  GetSystemToolTemplatesResponseSchema,
  GetToolPathQuerySchema,
  GetToolPathResponseSchema
} from './api';

export const ToolPath: OpenAPIPath = {
  '/core/app/tool/getSystemToolTemplates': {
    post: {
      summary: '获取系统工具模板列表',
      description: '获取可添加到工作流中的系统工具模板列表，支持搜索、标签筛选和工具集子工具查询',
      tags: [TagsMap.appSystemTool],
      requestBody: {
        content: {
          'application/json': {
            schema: GetSystemToolTemplatesBodySchema
          }
        }
      },
      responses: {
        200: {
          description: '成功获取系统工具模板列表',
          content: {
            'application/json': {
              schema: GetSystemToolTemplatesResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/tool/path': {
    get: {
      summary: '获取工具路径',
      description: '获取系统工具或工具集子工具在工具树中的路径',
      tags: [TagsMap.appSystemTool],
      requestParams: {
        query: GetToolPathQuerySchema
      },
      responses: {
        200: {
          description: '成功获取工具路径',
          content: {
            'application/json': {
              schema: GetToolPathResponseSchema
            }
          }
        }
      }
    }
  },
  '/core/app/tool/getPreviewNode': {
    get: {
      summary: '获取工具节点信息',
      description:
        '根据工具 ID 和版本配置生成可插入工作流画布的工具节点模板，支持系统工具和我的工具（MCP、HTTP、工作流工具）',
      tags: [TagsMap.appSystemTool, TagsMap.httpTools, TagsMap.mcpTools, TagsMap.pluginTeam],
      requestParams: {
        query: GetPreviewNodeQueryOpenAPISchema
      },
      responses: {
        200: {
          description: '成功获取工具节点信息',
          content: {
            'application/json': {
              schema: GetPreviewNodeResponseSchema
            }
          }
        }
      }
    }
  }
};
