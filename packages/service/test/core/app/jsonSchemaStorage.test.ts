import { describe, expect, it } from 'vitest';
import {
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
                requestSchema: { type: 'object' }
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
