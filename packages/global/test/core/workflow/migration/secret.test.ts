import { describe, expect, it } from 'vitest';
import {
  migrateSecretValueToCurrent,
  migrateWorkflowSecretValues
} from '@fastgpt/global/core/workflow/migration/secret';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

describe('migrateSecretValueToCurrent', () => {
  it('uses non-empty value before legacy secret and keeps canonical branches', () => {
    expect(migrateSecretValueToCurrent({ value: 'plain', secret: 'cipher' })).toEqual({
      value: 'plain'
    });
    expect(migrateSecretValueToCurrent({ value: '', secret: 'cipher' })).toEqual({
      secret: 'cipher'
    });
    expect(migrateSecretValueToCurrent({ value: 'plain' })).toEqual({ value: 'plain' });
    expect(migrateSecretValueToCurrent({ secret: 'cipher' })).toEqual({ secret: 'cipher' });
    expect(migrateSecretValueToCurrent({ ref: ['node-1', 'token'] })).toEqual({
      ref: ['node-1', 'token']
    });
  });

  it('leaves ordinary ref-shaped JSON and unrelated values alone', () => {
    expect(migrateSecretValueToCurrent({ ref: [] })).toEqual({ ref: [] });
    expect(migrateSecretValueToCurrent({ ref: 'ordinary-data' })).toEqual({
      ref: 'ordinary-data'
    });
    expect(migrateSecretValueToCurrent('plain')).toBe('plain');
    expect(migrateSecretValueToCurrent({ other: 'value' })).toEqual({ other: 'value' });
    expect(migrateSecretValueToCurrent({ value: 1 })).toEqual({ value: 1 });
  });
});

describe('migrateWorkflowSecretValues', () => {
  it('migrates input lists, header secrets, tool sets, and legacy MCP values', () => {
    const input = {
      nodes: [
        {
          inputs: [
            {
              inputList: [
                { key: 'token', inputType: 'secret', value: { value: 'plain', secret: 'cipher' } },
                { key: 'text', inputType: 'input', value: { value: '', secret: 'keep' } }
              ]
            },
            {
              key: 'password',
              renderTypeList: [FlowNodeInputTypeEnum.password],
              value: { value: '', secret: 'cipher' }
            },
            {
              key: 'text',
              renderTypeList: [FlowNodeInputTypeEnum.input],
              value: { value: '', secret: 'keep' }
            },
            {
              key: NodeInputKeyEnum.headerSecret,
              value: { Authorization: { value: '', secret: 'cipher' } }
            },
            {
              key: NodeInputKeyEnum.systemInputConfig,
              inputList: [
                {
                  key: 'token',
                  inputType: 'secret',
                  value: { value: 'default', secret: 'ignored' }
                },
                { key: 'refToken', inputType: 'secret', value: { ref: ['node-1', 'token'] } }
              ],
              value: {
                type: 'manual',
                value: {
                  token: { value: '', secret: 'cipher' },
                  refToken: { ref: ['node-1', 'token'] }
                }
              }
            },
            {
              key: NodeInputKeyEnum.systemInputConfig,
              value: {
                type: 'system',
                value: { token: { value: 'system-plain', secret: 'ignored' } }
              }
            },
            {
              value: { headerSecret: { Legacy: { value: 'plain', secret: 'cipher' } } }
            },
            {
              key: NodeInputKeyEnum.selectedTools,
              value: [
                {
                  id: 'tool-1',
                  config: {
                    apiKey: { value: 'plain', secret: 'cipher' },
                    system_input_config: {
                      type: 'system',
                      value: { token: { value: '', secret: 'cipher' } }
                    },
                    ordinary: { nested: true }
                  },
                  toolConfig: {
                    httpToolSet: {
                      headerSecret: { Authorization: { value: '', secret: 'cipher' } }
                    }
                  }
                }
              ]
            }
          ],
          toolConfig: {
            mcpToolSet: {
              headerSecret: { Mcp: { value: 'plain', secret: 'cipher' } },
              toolList: [{ headerSecret: { Nested: { value: 'plain', secret: 'cipher' } } }]
            },
            httpToolSet: {
              headerSecret: { Http: { value: 'plain', secret: 'cipher' } },
              toolList: [{ headerSecret: { Nested: { value: '', secret: 'cipher' } } }]
            }
          }
        }
      ]
    };

    const result = migrateWorkflowSecretValues(input);
    expect(result.nodes[0]).toEqual({
      inputs: [
        {
          inputList: [
            { key: 'token', inputType: 'secret', value: { value: 'plain' } },
            { key: 'text', inputType: 'input', value: { value: '', secret: 'keep' } }
          ]
        },
        {
          key: 'password',
          renderTypeList: [FlowNodeInputTypeEnum.password],
          value: { secret: 'cipher' }
        },
        {
          key: 'text',
          renderTypeList: [FlowNodeInputTypeEnum.input],
          value: { value: '', secret: 'keep' }
        },
        { key: NodeInputKeyEnum.headerSecret, value: { Authorization: { secret: 'cipher' } } },
        {
          key: NodeInputKeyEnum.systemInputConfig,
          inputList: [
            { key: 'token', inputType: 'secret', value: { value: 'default' } },
            {
              key: 'refToken',
              inputType: 'secret',
              value: { ref: ['node-1', 'token'] }
            }
          ],
          value: {
            type: 'manual',
            value: {
              token: { secret: 'cipher' },
              refToken: { ref: ['node-1', 'token'] }
            }
          }
        },
        {
          key: NodeInputKeyEnum.systemInputConfig,
          value: { type: 'system', value: { token: { value: 'system-plain' } } }
        },
        { value: { headerSecret: { Legacy: { value: 'plain' } } } },
        {
          key: NodeInputKeyEnum.selectedTools,
          value: [
            {
              id: 'tool-1',
              config: {
                apiKey: { value: 'plain', secret: 'cipher' },
                system_input_config: {
                  type: 'system',
                  value: { token: { value: '', secret: 'cipher' } }
                },
                ordinary: { nested: true }
              },
              toolConfig: {
                httpToolSet: {
                  headerSecret: { Authorization: { secret: 'cipher' } }
                }
              }
            }
          ]
        }
      ],
      toolConfig: {
        mcpToolSet: {
          headerSecret: { Mcp: { value: 'plain' } },
          toolList: [{ headerSecret: { Nested: { value: 'plain' } } }]
        },
        httpToolSet: {
          headerSecret: { Http: { value: 'plain' } },
          toolList: [{ headerSecret: { Nested: { secret: 'cipher' } } }]
        }
      }
    });
    expect(migrateWorkflowSecretValues(result)).toEqual(result);
  });
});
