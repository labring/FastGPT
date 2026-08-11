import { describe, expect, it } from 'vitest';
import {
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

  it('decodes new strings and preserves historical objects', () => {
    const historicalSchema = { type: 'object', properties: { id: { type: 'string' } } };
    const stored = [
      {
        toolConfig: {
          mcpToolSet: {
            toolList: [{ inputSchema: JSON.stringify(historicalSchema) }]
          },
          httpToolSet: {
            toolList: [{ inputSchema: historicalSchema }]
          }
        }
      }
    ];

    expect(decodeWorkflowNodesFromStorage(stored)).toEqual([
      {
        toolConfig: {
          mcpToolSet: {
            toolList: [{ inputSchema: historicalSchema }]
          },
          httpToolSet: {
            toolList: [{ inputSchema: historicalSchema }]
          }
        }
      }
    ]);
  });
});
