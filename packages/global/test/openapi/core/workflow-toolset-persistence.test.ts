import { describe, expect, it } from 'vitest';
import { PublishAppBodySchema } from '../../../openapi/core/app/version/api';
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
});
