import { describe, expect, it } from 'vitest';
import {
  PublishAppBodySchema,
  PublishHttpToolSetAppBodySchema,
  PublishMcpToolSetAppBodySchema
} from '../../../openapi/core/app/version/api';
import { OpenAPIStoreNodeItemTypeSchema } from '../../../openapi/core/workflow/node';
import { FlowNodeTypeEnum } from '../../../core/workflow/node/constant';

describe('persisted workflow toolset API contract', () => {
  it('stores independent tool summaries and keeps app toolset references unchanged', () => {
    const summary = { name: 'search', description: 'Search documents' };
    const baseNode = {
      nodeId: 'toolset-node',
      flowNodeType: FlowNodeTypeEnum.toolSet,
      name: 'Tool set',
      inputs: [],
      outputs: []
    };

    expect(
      PublishAppBodySchema.safeParse({
        nodes: [
          {
            ...baseNode,
            toolConfig: {
              mcpToolSet: { url: 'https://mcp.example', toolList: [summary] }
            }
          },
          {
            ...baseNode,
            nodeId: 'http-toolset-node',
            toolConfig: {
              httpToolSet: {
                apiSchemaUrl: 'https://http.example/openapi.json',
                toolList: [summary]
              }
            }
          },
          {
            ...baseNode,
            pluginId: 'toolset-app',
            toolConfig: {
              mcpToolSet: { toolId: 'toolset-id', toolList: [summary] }
            }
          }
        ]
      }).success
    ).toBe(true);

    expect(
      PublishAppBodySchema.safeParse({
        nodes: [
          {
            ...baseNode,
            toolConfig: {
              mcpToolSet: {
                url: 'https://mcp.example',
                toolList: [
                  {
                    ...summary,
                    inputSchema: { type: 'object' }
                  }
                ]
              }
            }
          }
        ]
      }).success
    ).toBe(false);

    expect(
      OpenAPIStoreNodeItemTypeSchema.safeParse({
        ...baseNode,
        toolConfig: {
          mcpToolSet: {
            url: 'https://mcp.example',
            toolList: [{ ...summary, inputSchema: { type: 'object' } }]
          }
        }
      }).success
    ).toBe(true);
  });

  it('accepts a complete runtime root only through the toolset App schema', () => {
    const mcpNode = {
      nodeId: 'toolset-node',
      flowNodeType: FlowNodeTypeEnum.toolSet,
      name: 'Tool set',
      inputs: [],
      outputs: [],
      toolConfig: {
        mcpToolSet: {
          url: 'https://mcp.example',
          toolList: [
            {
              name: 'search',
              description: 'Search documents',
              inputSchema: { type: 'object' }
            }
          ]
        }
      }
    };
    const httpNode = {
      nodeId: 'http-toolset-node',
      flowNodeType: FlowNodeTypeEnum.toolSet,
      name: 'HTTP tool set',
      inputs: [],
      outputs: [],
      toolConfig: {
        httpToolSet: {
          baseUrl: 'https://api.example.com',
          apiSchemaStr: '{"openapi":"3.0.0"}',
          toolList: [
            {
              name: 'search',
              description: 'Search documents',
              path: '/search',
              method: 'GET',
              inputSchema: { type: 'object' }
            }
          ]
        }
      }
    };

    expect(PublishAppBodySchema.safeParse({ nodes: [mcpNode] }).success).toBe(false);
    expect(PublishMcpToolSetAppBodySchema.safeParse({ nodes: [mcpNode] }).success).toBe(true);
    expect(PublishHttpToolSetAppBodySchema.safeParse({ nodes: [mcpNode] }).success).toBe(false);
    expect(PublishMcpToolSetAppBodySchema.safeParse({ nodes: [httpNode] }).success).toBe(false);
    expect(PublishHttpToolSetAppBodySchema.safeParse({ nodes: [httpNode] }).success).toBe(true);
    expect(
      PublishMcpToolSetAppBodySchema.safeParse({
        nodes: [mcpNode, { ...mcpNode, nodeId: 'second-toolset' }]
      }).success
    ).toBe(false);
  });
});
