import { describe, expect, it } from 'vitest';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  cleanToolSetJsonSchemasForStorage,
  compactToolSetNodesForStorage,
  decodeHttpToolSetNodesFromStorage,
  decodeMcpToolSetNodesFromStorage,
  encodeToolSetNodesForStorage,
  encodeHttpToolSetNodesForStorage,
  encodeMcpToolSetNodesForStorage
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
                requestSchema: { type: 'object' },
                responseSchema: { type: 'object' },
                secretSchema: { type: 'object' }
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
    expect(typeof encodedHttp[0].toolConfig.httpToolSet.toolList[0].responseSchema).toBe('string');
    expect(typeof encodedHttp[0].toolConfig.httpToolSet.toolList[0].secretSchema).toBe('string');
    expect(encodedMcp[0].toolConfig.mcpToolSet.toolList[0].inputSchema).toContain('$schema');
  });

  it('encodes both MCP and HTTP tool schemas in one workflow', () => {
    const nodes = [
      {
        toolConfig: {
          mcpToolSet: {
            toolList: [{ inputSchema: { type: 'object' } }]
          },
          httpToolSet: {
            toolList: [
              {
                inputSchema: { type: 'object' },
                outputSchema: { type: 'object' },
                requestSchema: { type: 'object' },
                responseSchema: { type: 'object' },
                secretSchema: { type: 'object' }
              }
            ]
          }
        }
      }
    ];

    const encoded = encodeToolSetNodesForStorage(nodes) as any[];
    const { mcpToolSet, httpToolSet } = encoded[0].toolConfig;

    expect(typeof mcpToolSet.toolList[0].inputSchema).toBe('string');
    expect(typeof httpToolSet.toolList[0].inputSchema).toBe('string');
    expect(typeof httpToolSet.toolList[0].outputSchema).toBe('string');
    expect(typeof httpToolSet.toolList[0].requestSchema).toBe('string');
    expect(typeof httpToolSet.toolList[0].responseSchema).toBe('string');
    expect(typeof httpToolSet.toolList[0].secretSchema).toBe('string');
  });

  it('compacts MCP and HTTP references without persisting tool schemas', () => {
    const nodes = [
      {
        pluginId: 'mcp-toolset',
        toolConfig: {
          mcpToolSet: {
            toolList: [{ inputSchema: { type: 'object' } }]
          }
        }
      },
      {
        pluginId: 'http-toolset',
        toolConfig: {
          httpToolSet: {
            toolList: [{ requestSchema: { type: 'object' } }]
          }
        }
      }
    ];

    const encoded = compactToolSetNodesForStorage(nodes) as any[];

    expect(encoded).toEqual([
      {
        pluginId: 'mcp-toolset',
        toolConfig: { mcpToolSet: { toolId: 'mcp-toolset' } }
      },
      {
        pluginId: 'http-toolset',
        toolConfig: { httpToolSet: { toolId: 'http-toolset' } }
      }
    ]);
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

  it('decodes both MCP and HTTP string schemas while preserving object schemas', () => {
    const mcpSchema = { type: 'object', properties: { query: { type: 'string' } } };
    const httpSchema = { type: 'object', properties: { body: { type: 'string' } } };
    const stored = [
      {
        toolConfig: {
          mcpToolSet: {
            toolList: [{ inputSchema: JSON.stringify(mcpSchema) }]
          },
          httpToolSet: {
            toolList: [
              {
                inputSchema: httpSchema,
                outputSchema: JSON.stringify(httpSchema),
                requestSchema: JSON.stringify(httpSchema)
              }
            ]
          }
        }
      }
    ];

    expect(decodeHttpToolSetNodesFromStorage(decodeMcpToolSetNodesFromStorage(stored))).toEqual([
      {
        toolConfig: {
          mcpToolSet: {
            toolList: [{ inputSchema: mcpSchema }]
          },
          httpToolSet: {
            toolList: [
              {
                inputSchema: httpSchema,
                outputSchema: httpSchema,
                requestSchema: httpSchema
              }
            ]
          }
        }
      }
    ]);
  });

  it('compacts MCP and HTTP toolset configs before workflow persistence', () => {
    const nodes = [
      {
        nodeId: 'toolset-node',
        pluginId: 'toolset-app',
        version: 'legacy-version',
        toolConfig: {
          mcpToolSet: {
            url: 'https://mcp.example.com',
            toolList: [{ name: 'search', description: 'Search' }]
          },
          httpToolSet: {
            baseUrl: 'https://api.example.com',
            toolList: [
              {
                name: 'create',
                description: 'Create',
                path: '/create',
                method: 'POST'
              }
            ]
          },
          mcpTool: { toolId: 'mcp-tool' }
        }
      }
    ];

    expect(compactToolSetNodesForStorage(nodes)).toEqual([
      {
        nodeId: 'toolset-node',
        pluginId: 'toolset-app',
        toolConfig: {
          mcpToolSet: { toolId: 'toolset-app' },
          httpToolSet: { toolId: 'toolset-app' },
          mcpTool: { toolId: 'mcp-tool' }
        }
      }
    ]);
  });

  it('derives a toolset ID when a runtime child node carries a full toolset config', () => {
    const nodes = [
      {
        pluginId: 'mcp-mcp-app/search',
        toolConfig: {
          mcpTool: { toolId: 'mcp-mcp-app/search' },
          mcpToolSet: {
            url: 'https://mcp.example.com',
            toolList: [{ name: 'search', inputSchema: { type: 'object' } }]
          },
          httpTool: { toolId: 'http-http-app/create' },
          httpToolSet: {
            baseUrl: 'https://api.example.com',
            toolList: [{ name: 'create', requestSchema: { type: 'object' } }]
          }
        }
      }
    ];

    expect(compactToolSetNodesForStorage(nodes)).toEqual([
      {
        pluginId: 'mcp-mcp-app/search',
        toolConfig: {
          mcpTool: { toolId: 'mcp-mcp-app/search' },
          mcpToolSet: { toolId: 'mcp-app' },
          httpTool: { toolId: 'http-http-app/create' },
          httpToolSet: { toolId: 'http-app' }
        }
      }
    ]);
  });

  it('removes versions from MCP and HTTP Agent tool snapshots', () => {
    const nodes = [
      {
        inputs: [
          {
            key: NodeInputKeyEnum.selectedTools,
            value: [
              {
                id: 'mcp-toolset',
                version: 'legacy-version',
                toolConfig: { mcpToolSet: { url: 'https://mcp.example.com', toolList: [] } }
              },
              {
                id: 'http-toolset',
                version: 'legacy-version',
                toolConfig: { httpToolSet: { toolList: [] } }
              }
            ]
          }
        ]
      }
    ];

    expect(compactToolSetNodesForStorage(nodes)).toEqual([
      {
        inputs: [
          {
            key: NodeInputKeyEnum.selectedTools,
            value: [
              { id: 'mcp-toolset', toolConfig: { mcpToolSet: { toolId: 'mcp-toolset' } } },
              { id: 'http-toolset', toolConfig: { httpToolSet: { toolId: 'http-toolset' } } }
            ]
          }
        ]
      }
    ]);
  });

  it('keeps already compact Agent tool snapshots unchanged', () => {
    const nodes = [
      {
        inputs: [
          {
            key: NodeInputKeyEnum.selectedTools,
            value: [
              { id: 'mcp-tool', toolConfig: { mcpTool: { toolId: 'mcp-tool' } } },
              { id: 'http-tool', toolConfig: { httpTool: { toolId: 'http-tool' } } }
            ]
          }
        ]
      }
    ];

    expect(compactToolSetNodesForStorage(nodes)).toBe(nodes);
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
