import { describe, expect, it } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { Node } from 'reactflow';
import { compareSnapshot, filterSensitiveNodesData } from '../../../../src/web/core/workflow/utils';

describe('compareSnapshot', () => {
  const snapshot = (toolConfig: unknown) => ({
    nodes: [
      {
        id: 'tool-set',
        type: 'toolSet',
        position: { x: 0, y: 0 },
        data: { flowNodeType: FlowNodeTypeEnum.toolSet, inputs: [], outputs: [], toolConfig }
      } as Node
    ],
    edges: []
  });

  it.each([
    [
      'MCP address',
      { mcpToolSet: { url: 'https://example.com/a', toolList: [] } },
      { mcpToolSet: { url: 'https://example.com/b', toolList: [] } }
    ],
    [
      'HTTP credential',
      { httpToolSet: { headerSecret: { 'X-API-Key': { secret: 'old' } } } },
      { httpToolSet: { headerSecret: { 'X-API-Key': { value: 'new' } } } }
    ],
    [
      'tool description',
      { mcpToolSet: { toolList: [{ name: 'search', description: 'before' }] } },
      { mcpToolSet: { toolList: [{ name: 'search', description: 'after' }] } }
    ]
  ])('detects changes to %s', (_label, before, after) => {
    expect(compareSnapshot(snapshot(before), snapshot(structuredClone(before)))).toBe(true);
    expect(compareSnapshot(snapshot(before), snapshot(after))).toBe(false);
  });
});

describe('filterSensitiveNodesData', () => {
  it('removes node-local MCP auth from exports without mutating the workflow', () => {
    const nodes = [
      {
        nodeId: 'mcp-set',
        flowNodeType: FlowNodeTypeEnum.toolSet,
        name: 'Local MCP',
        inputs: [],
        outputs: [],
        toolConfig: {
          mcpToolSet: {
            url: 'https://mcp.example.com',
            headerSecret: { Authorization: { value: 'mcp-token', secret: '' } },
            toolList: []
          }
        }
      } as StoreNodeItemType
    ];

    const exported = filterSensitiveNodesData(nodes);

    expect(JSON.stringify(exported)).not.toContain('mcp-token');
    expect(exported[0].toolConfig?.mcpToolSet).toMatchObject({
      url: 'https://mcp.example.com',
      toolList: []
    });
    expect(JSON.stringify(nodes)).toContain('mcp-token');
  });

  it('removes HTTP parent and legacy child auth from exports without mutating the workflow', () => {
    const nodes = [
      {
        nodeId: 'http-set',
        flowNodeType: FlowNodeTypeEnum.toolSet,
        name: 'HTTP tool set',
        inputs: [],
        outputs: [],
        toolConfig: {
          httpToolSet: {
            baseUrl: 'https://api.example.com',
            toolList: [
              {
                name: 'search',
                description: 'Search',
                path: '/search',
                method: 'get',
                headerSecret: { Authorization: { value: 'child-token', secret: '' } }
              }
            ]
          }
        }
      } as StoreNodeItemType
    ];

    const exported = filterSensitiveNodesData(nodes);

    expect(JSON.stringify(exported)).not.toContain('child-token');
    expect(exported[0].toolConfig?.httpToolSet?.toolList?.[0]).not.toHaveProperty('headerSecret');
    expect(JSON.stringify(nodes)).toContain('child-token');
  });

  it('clears Agent selected tools while preserving the original workflow', () => {
    const secrets = [
      'mcp-child-secret',
      'http-child-secret',
      'mcp-set-secret',
      'mcp-set-child-secret',
      'http-set-secret',
      'http-set-child-secret'
    ];
    const nodes = [
      {
        nodeId: 'agent-1',
        flowNodeType: FlowNodeTypeEnum.agent,
        name: 'Agent',
        inputs: [
          {
            key: NodeInputKeyEnum.selectedTools,
            label: 'Selected tools',
            renderTypeList: [],
            value: [
              {
                id: 'mcp-child',
                config: {},
                toolConfig: {
                  mcpTool: {
                    toolId: 'mcp-app/search',
                    headerSecret: { Authorization: { value: secrets[0], secret: '' } }
                  }
                }
              },
              {
                id: 'http-child',
                config: {},
                toolConfig: {
                  httpTool: {
                    toolId: 'http-app/search',
                    headerSecret: { Authorization: { value: secrets[1], secret: '' } }
                  }
                }
              },
              {
                id: 'mcp-set',
                config: {},
                toolConfig: {
                  mcpToolSet: {
                    toolId: 'mcp-app',
                    headerSecret: { Authorization: { value: secrets[2], secret: '' } },
                    toolList: [
                      {
                        name: 'search',
                        description: 'MCP search',
                        headerSecret: { Authorization: { value: secrets[3], secret: '' } }
                      }
                    ]
                  }
                }
              },
              {
                id: 'http-set',
                config: {},
                toolConfig: {
                  httpToolSet: {
                    toolId: 'http-app',
                    headerSecret: { Authorization: { value: secrets[4], secret: '' } },
                    toolList: [
                      {
                        name: 'search',
                        description: 'HTTP search',
                        headerSecret: { Authorization: { value: secrets[5], secret: '' } }
                      }
                    ]
                  }
                }
              }
            ]
          }
        ],
        outputs: []
      } as unknown as StoreNodeItemType
    ];

    const exported = filterSensitiveNodesData(nodes);
    const selectedTools = exported[0].inputs[0].value as any[];

    expect(selectedTools).toEqual([]);
    secrets.forEach((secret) => expect(JSON.stringify(exported)).not.toContain(secret));
    expect(JSON.stringify(nodes)).toContain(secrets[0]);
  });
});
