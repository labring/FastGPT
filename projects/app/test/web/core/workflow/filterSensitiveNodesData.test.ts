import { describe, expect, it } from 'vitest';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { filterSensitiveNodesData } from '@/web/core/workflow/utils';

const headerSecret = { Authorization: { value: 'token', secret: 'encrypted-token' } };

describe('filterSensitiveNodesData', () => {
  it('filters known tool credentials without changing URLs or ordinary values', () => {
    const nodes = [
      {
        flowNodeType: FlowNodeTypeEnum.toolSet,
        toolConfig: {
          mcpTool: { url: 'https://mcp.example/tools', headerSecret },
          httpTool: { url: 'https://http.example/tool', headerSecret },
          mcpToolSet: {
            url: 'https://mcp.example/tools',
            headerSecret,
            toolList: [{ name: 'search', headerSecret }]
          },
          httpToolSet: {
            apiSchemaUrl: 'https://http.example/openapi.json',
            baseUrl: 'https://http.example',
            headerSecret,
            toolList: [{ name: 'search', headerSecret }]
          }
        },
        inputs: [
          {
            key: NodeInputKeyEnum.selectedTools,
            value: [{ toolConfig: { mcpTool: { url: 'https://mcp.example/tool', headerSecret } } }]
          },
          { key: 'ordinaryInput', value: { headerSecret: 'ordinary-value' } }
        ],
        outputs: []
      }
    ] as any;

    const filteredNodes = filterSensitiveNodesData(nodes);
    const filteredNode = filteredNodes[0];

    expect(filteredNode.toolConfig).toMatchObject({
      mcpTool: { url: 'https://mcp.example/tools' },
      httpTool: { url: 'https://http.example/tool' },
      mcpToolSet: {
        url: 'https://mcp.example/tools',
        toolList: [{ name: 'search' }]
      },
      httpToolSet: {
        apiSchemaUrl: 'https://http.example/openapi.json',
        baseUrl: 'https://http.example',
        toolList: [{ name: 'search' }]
      }
    });
    expect(filteredNode.toolConfig.mcpTool).not.toHaveProperty('headerSecret');
    expect(filteredNode.toolConfig.httpTool).not.toHaveProperty('headerSecret');
    expect(filteredNode.toolConfig.mcpToolSet).not.toHaveProperty('headerSecret');
    expect(filteredNode.toolConfig.mcpToolSet.toolList[0]).not.toHaveProperty('headerSecret');
    expect(filteredNode.toolConfig.httpToolSet).not.toHaveProperty('headerSecret');
    expect(filteredNode.toolConfig.httpToolSet.toolList[0]).not.toHaveProperty('headerSecret');
    expect(filteredNode.inputs[0].value[0].toolConfig.mcpTool).toEqual({
      url: 'https://mcp.example/tool'
    });
    expect(filteredNode.inputs[1].value).toEqual({ headerSecret: 'ordinary-value' });
    expect(nodes[0].toolConfig.mcpTool).toHaveProperty('headerSecret');
  });
});
