import { describe, expect, it } from 'vitest';
import {
  cleanToolSetJsonSchemasForStorage,
  decodeHttpToolSetNodesFromStorage,
  decodeMcpToolSetNodesFromStorage,
  encodeHttpToolSetNodesForStorage,
  encodeMcpToolSetNodesForStorage,
  compactWorkflowToolConfigsForStorage
} from '@fastgpt/service/core/app/jsonSchemaStorage';

describe('workflow JSON Schema storage codec', () => {
  it('encodes MCP and HTTP tool schemas without changing node structure', () => {
    const nodes = [
      {
        toolConfig: {
          mcpToolSet: {
            toolList: [
              {
                inputSchema: {
                  $schema: 'https://json-schema.org/draft/2020-12/schema',
                  properties: { query: { type: 'string' } }
                }
              }
            ]
          },
          httpToolSet: {
            toolList: [
              {
                inputSchema: { type: 'object' },
                outputSchema: { type: 'object' },
                requestSchema: { type: 'object' }
              }
            ]
          }
        }
      }
    ];

    const encodedMcp = encodeMcpToolSetNodesForStorage(nodes) as any[];
    const encodedHttp = encodeHttpToolSetNodesForStorage(nodes) as any[];

    expect(typeof encodedMcp[0].toolConfig.mcpToolSet.toolList[0].inputSchema).toBe('string');
    expect(typeof encodedHttp[0].toolConfig.httpToolSet.toolList[0].inputSchema).toBe('string');
    expect(typeof encodedHttp[0].toolConfig.httpToolSet.toolList[0].outputSchema).toBe('string');
    expect(typeof encodedHttp[0].toolConfig.httpToolSet.toolList[0].requestSchema).toBe('string');
    expect(encodedMcp[0].toolConfig.mcpToolSet.toolList[0].inputSchema).toContain('$schema');
  });

  it('decodes stored strings', () => {
    const historicalSchema = { type: 'object', properties: { id: { type: 'string' } } };
    const stored = [
      {
        toolConfig: {
          mcpToolSet: {
            toolList: [{ inputSchema: JSON.stringify(historicalSchema) }]
          }
        }
      }
    ];

    expect(decodeMcpToolSetNodesFromStorage(stored)).toEqual([
      {
        toolConfig: {
          mcpToolSet: {
            toolList: [{ inputSchema: historicalSchema }]
          }
        }
      }
    ]);
  });

  it('preserves historical object schemas during runtime reads', () => {
    const nodes = [
      { toolConfig: { mcpToolSet: { toolList: [{ inputSchema: { type: 'object' } }] } } }
    ];
    expect(decodeMcpToolSetNodesFromStorage(nodes)).toEqual(nodes);
  });

  it('compacts MCP and HTTP workflow tool configurations to toolset references', () => {
    const nodes = [
      {
        jsonSchema: { type: 'object' },
        pluginId: 'mcp-app',
        toolConfig: {
          mcpToolSet: {
            url: 'https://mcp.example.com',
            headerSecret: { Authorization: { value: 'secret', secret: '' } },
            toolList: [{ name: 'search', description: 'Search', inputSchema: { type: 'object' } }]
          },
          httpTool: {
            toolId: 'http-app/search'
          },
          customConfig: {
            inputSchema: { type: 'object' }
          }
        },
        inputs: [
          {
            key: 'agent_selectedTools',
            value: [
              {
                id: 'http-app',
                toolConfig: {
                  httpToolSet: {
                    toolList: [
                      {
                        name: 'search',
                        requestSchema: JSON.stringify({ type: 'object' }),
                        outputSchema: { type: 'object' }
                      }
                    ]
                  }
                }
              }
            ]
          }
        ]
      }
    ];

    expect(compactWorkflowToolConfigsForStorage(nodes)).toEqual([
      {
        jsonSchema: { type: 'object' },
        pluginId: 'mcp-app',
        toolConfig: {
          mcpToolSet: { toolId: 'mcp-app' },
          httpTool: { toolId: 'http-app/search' },
          customConfig: {
            inputSchema: { type: 'object' }
          }
        },
        inputs: [
          {
            key: 'agent_selectedTools',
            value: [
              {
                id: 'http-app',
                toolConfig: {
                  httpToolSet: { toolId: 'http-app' }
                }
              }
            ]
          }
        ]
      }
    ]);
  });

  it('preserves the nodes reference when workflow tool configs are already compact', () => {
    const nodes = [{ toolConfig: { mcpTool: { toolId: 'mcp-app/search' } } }];

    expect(compactWorkflowToolConfigsForStorage(nodes)).toBe(nodes);
  });

  it('compacts Agent selected tool snapshots in the same workflow pass', () => {
    const nodes = [
      {
        inputs: [
          {
            key: 'agent_selectedTools',
            value: [
              {
                id: 'http-app',
                version: '',
                toolConfig: {
                  httpToolSet: {
                    toolList: [
                      {
                        name: 'search',
                        description: 'Search',
                        path: '/search',
                        method: 'GET',
                        requestSchema: { type: 'object' }
                      }
                    ]
                  }
                },
                config: {}
              },
              {
                id: 'mcp-app/search',
                toolConfig: {
                  mcpTool: { toolId: 'mcp-mcp-app/search' },
                  mcpToolSet: {
                    url: 'https://mcp.example.com',
                    toolList: [{ name: 'search', inputSchema: { type: 'object' } }]
                  }
                },
                config: {}
              }
            ]
          }
        ]
      }
    ];

    expect(compactWorkflowToolConfigsForStorage(nodes)).toEqual([
      {
        inputs: [
          {
            key: 'agent_selectedTools',
            value: [
              {
                id: 'http-app',
                toolConfig: { httpToolSet: { toolId: 'http-app' } },
                config: {}
              },
              {
                id: 'mcp-app/search',
                toolConfig: {
                  mcpTool: { toolId: 'mcp-mcp-app/search' },
                  mcpToolSet: { toolId: 'mcp-app' }
                },
                config: {}
              }
            ]
          }
        ]
      }
    ]);
  });

  it('drops an unresolvable historical toolset snapshot instead of persisting it', () => {
    const nodes = [
      {
        toolConfig: {
          httpToolSet: {
            toolList: [{ name: 'search', path: '/search', method: 'GET' }]
          }
        }
      }
    ];

    expect(compactWorkflowToolConfigsForStorage(nodes)).toEqual([{ toolConfig: {} }]);
  });

  it('extracts the parent toolset id from a historical selected tool id', () => {
    const nodes = [
      {
        inputs: [
          {
            key: 'agent_selectedTools',
            value: [
              {
                id: 'mcp-mcp-app//test',
                toolConfig: {
                  mcpToolSet: {
                    url: 'https://mcp.example.com',
                    toolList: [{ name: '/test', inputSchema: { type: 'object' } }]
                  }
                }
              }
            ]
          }
        ]
      }
    ];

    expect(compactWorkflowToolConfigsForStorage(nodes)).toEqual([
      {
        inputs: [
          {
            key: 'agent_selectedTools',
            value: [
              {
                id: 'mcp-mcp-app//test',
                toolConfig: { mcpToolSet: { toolId: 'mcp-app' } }
              }
            ]
          }
        ]
      }
    ]);
  });

  it('does not transform schema-like fields outside the selected tool set', () => {
    const nodes = [
      {
        inputs: [{ inputSchema: { type: 'object' } }],
        toolConfig: {
          httpToolSet: {
            toolList: [{ inputSchema: { type: 'object' } }]
          }
        }
      }
    ];

    const encoded = encodeHttpToolSetNodesForStorage(nodes) as any[];

    expect(encoded[0].inputs[0].inputSchema).toEqual({ type: 'object' });
    expect(typeof encoded[0].toolConfig.httpToolSet.toolList[0].inputSchema).toBe('string');
  });
});
