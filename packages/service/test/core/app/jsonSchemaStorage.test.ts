import { describe, expect, it } from 'vitest';
import {
  cleanWorkflowToolJsonSchemasForStorage,
  decodeWorkflowNodesFromStorage,
  encodeWorkflowNodesForStorage
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

    const encoded = encodeWorkflowNodesForStorage(nodes) as any[];

    expect(typeof encoded[0].toolConfig.mcpToolSet.toolList[0].inputSchema).toBe('string');
    expect(typeof encoded[0].toolConfig.httpToolSet.toolList[0].inputSchema).toBe('string');
    expect(typeof encoded[0].toolConfig.httpToolSet.toolList[0].outputSchema).toBe('string');
    expect(typeof encoded[0].toolConfig.httpToolSet.toolList[0].requestSchema).toBe('string');
    expect(encoded[0].toolConfig.mcpToolSet.toolList[0].inputSchema).toContain('$schema');
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

    expect(decodeWorkflowNodesFromStorage(stored)).toEqual([
      {
        toolConfig: {
          mcpToolSet: {
            toolList: [{ inputSchema: historicalSchema }]
          }
        }
      }
    ]);
  });

  it('rejects historical object schemas during runtime reads', () => {
    expect(() =>
      decodeWorkflowNodesFromStorage([
        {
          toolConfig: {
            mcpToolSet: {
              toolList: [{ inputSchema: { type: 'object' } }]
            }
          }
        }
      ])
    ).toThrow('Stored tool JSON Schema must be a string');
  });

  it('cleans historical object schemas for upgrade scripts', () => {
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
                requestSchema: JSON.stringify({ type: 'object' })
              }
            ]
          }
        }
      }
    ];

    const result = cleanWorkflowToolJsonSchemasForStorage(nodes);

    expect(result.changed).toBe(true);
    expect(result.convertedSchemaCount).toBe(3);
    expect(result.nodes).not.toBe(nodes);
    expect((result.nodes as any[])[0].toolConfig.httpToolSet.toolList[0].requestSchema).toBe(
      JSON.stringify({ type: 'object' })
    );
    expect(decodeWorkflowNodesFromStorage(result.nodes)).toEqual([
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
    ]);
  });

  it('preserves the nodes reference when cleanup is unnecessary', () => {
    const nodes = [
      {
        toolConfig: {
          mcpToolSet: {
            toolList: [{ inputSchema: JSON.stringify({ type: 'object' }) }]
          }
        }
      }
    ];

    expect(cleanWorkflowToolJsonSchemasForStorage(nodes)).toEqual({
      nodes,
      changed: false,
      convertedSchemaCount: 0
    });
  });
});
