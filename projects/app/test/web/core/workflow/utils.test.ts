import { describe, expect, it } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { filterSensitiveNodesData } from '../../../../src/web/core/workflow/utils';

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

  it.each(['', 'external-tool-set'])(
    'removes HTTP auth from exports for pluginId "%s" without mutating the workflow',
    (pluginId) => {
      const nodes = [
        {
          nodeId: 'http-set',
          flowNodeType: FlowNodeTypeEnum.toolSet,
          pluginId,
          name: 'HTTP tool set',
          inputs: [],
          outputs: [],
          toolConfig: {
            httpToolSet: {
              baseUrl: 'https://api.example.com',
              headerSecret: { Authorization: { value: 'http-token', secret: '' } },
              toolList: []
            }
          }
        } as StoreNodeItemType
      ];

      const exported = filterSensitiveNodesData(nodes);

      expect(JSON.stringify(exported)).not.toContain('http-token');
      expect(exported[0].toolConfig?.httpToolSet).toMatchObject({
        baseUrl: 'https://api.example.com',
        toolList: []
      });
      expect(JSON.stringify(nodes)).toContain('http-token');
    }
  );

  it('removes legacy per-tool HTTP auth from inline exports without mutating the workflow', () => {
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
                headerSecret: { Authorization: { value: 'legacy-child-token', secret: '' } }
              }
            ]
          }
        }
      } as StoreNodeItemType
    ];

    const exported = filterSensitiveNodesData(nodes);

    expect(JSON.stringify(exported)).not.toContain('legacy-child-token');
    expect(exported[0].toolConfig?.httpToolSet?.toolList?.[0]).not.toHaveProperty('headerSecret');
    expect(JSON.stringify(nodes)).toContain('legacy-child-token');
  });

  it('removes legacy per-tool HTTP auth from external exports without mutating the workflow', () => {
    const secret = 'external-child-token';
    const nodes = [
      {
        nodeId: 'http-set',
        flowNodeType: FlowNodeTypeEnum.toolSet,
        pluginId: 'external-tool-set',
        name: 'HTTP tool set',
        inputs: [],
        outputs: [],
        toolConfig: {
          httpToolSet: {
            toolId: 'external-tool-set',
            toolList: [
              {
                name: 'search',
                description: 'Search',
                headerSecret: { Authorization: { value: secret, secret: '' } }
              }
            ]
          }
        }
      } as StoreNodeItemType
    ];

    const exported = filterSensitiveNodesData(nodes);

    expect(exported[0].toolConfig?.httpToolSet).toMatchObject({
      toolId: 'external-tool-set',
      toolList: [{ name: 'search', description: 'Search' }]
    });
    expect(exported[0].toolConfig?.httpToolSet?.toolList?.[0]).not.toHaveProperty('headerSecret');
    expect(JSON.stringify(exported)).not.toContain(secret);
    expect(JSON.stringify(nodes)).toContain(secret);
  });

  it('removes legacy per-tool MCP auth from external exports', () => {
    const secret = 'external-mcp-child-token';
    const nodes = [
      {
        nodeId: 'mcp-set',
        flowNodeType: FlowNodeTypeEnum.toolSet,
        pluginId: 'external-mcp-tool-set',
        name: 'MCP tool set',
        inputs: [],
        outputs: [],
        toolConfig: {
          mcpToolSet: {
            toolId: 'external-mcp-tool-set',
            toolList: [
              {
                name: 'search',
                description: 'Search',
                headerSecret: { Authorization: { value: secret, secret: '' } }
              }
            ]
          }
        }
      } as StoreNodeItemType
    ];

    const exported = filterSensitiveNodesData(nodes);

    expect(exported[0].toolConfig?.mcpToolSet).toMatchObject({
      toolId: 'external-mcp-tool-set',
      toolList: [{ name: 'search', description: 'Search' }]
    });
    expect(exported[0].toolConfig?.mcpToolSet?.toolList?.[0]).not.toHaveProperty('headerSecret');
    expect(JSON.stringify(exported)).not.toContain(secret);
    expect(JSON.stringify(nodes)).toContain(secret);
  });

  it('removes misplaced auth from external Agent selected-tool payloads while preserving references', () => {
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

    expect(selectedTools[0].toolConfig.mcpTool.toolId).toBe('mcp-app/search');
    expect(selectedTools[1].toolConfig.httpTool.toolId).toBe('http-app/search');
    expect(selectedTools[2].toolConfig.mcpToolSet).toMatchObject({
      toolId: 'mcp-app',
      toolList: [{ name: 'search', description: 'MCP search' }]
    });
    expect(selectedTools[3].toolConfig.httpToolSet).toMatchObject({
      toolId: 'http-app',
      toolList: [{ name: 'search', description: 'HTTP search' }]
    });
    expect(JSON.stringify(exported)).not.toContain(secrets[0]);
    expect(JSON.stringify(exported)).not.toContain(secrets[1]);
    expect(JSON.stringify(exported)).not.toContain(secrets[2]);
    expect(JSON.stringify(exported)).not.toContain(secrets[3]);
    expect(JSON.stringify(exported)).not.toContain(secrets[4]);
    expect(JSON.stringify(exported)).not.toContain(secrets[5]);
    expect(JSON.stringify(nodes)).toContain(secrets[0]);
  });
});
