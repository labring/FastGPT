import { describe, expect, it } from 'vitest';
import { isToolInputValueConfigured } from '@fastgpt/global/core/app/formEdit/utils';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
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

  it('filters HTTP and password input credentials while preserving refs and ordinary values', () => {
    const nodes = [
      {
        nodeId: 'http',
        flowNodeType: FlowNodeTypeEnum.httpRequest468,
        inputs: [
          {
            key: NodeInputKeyEnum.headerSecret,
            renderTypeList: [FlowNodeInputTypeEnum.hidden],
            value: {
              Authorization: { value: 'plain-token' },
              'X-Encrypted': { secret: 'cipher-token' },
              'X-Reference': { ref: ['start', 'token'] }
            }
          },
          {
            key: 'password',
            renderTypeList: [FlowNodeInputTypeEnum.password],
            value: { secret: 'password-cipher' }
          },
          {
            key: 'passwordRef',
            renderTypeList: [FlowNodeInputTypeEnum.password],
            selectedType: FlowNodeInputTypeEnum.reference,
            value: { ref: ['start', 'password'] }
          },
          {
            key: 'passwordTuple',
            renderTypeList: [FlowNodeInputTypeEnum.password, FlowNodeInputTypeEnum.reference],
            selectedType: FlowNodeInputTypeEnum.reference,
            value: ['start', 'password']
          },
          {
            key: 'ordinary',
            renderTypeList: [FlowNodeInputTypeEnum.input],
            value: { value: 'ordinary-value' }
          }
        ],
        outputs: []
      }
    ] as any;

    const filtered = filterSensitiveNodesData(nodes);

    expect(filtered[0].inputs).toEqual([
      {
        key: NodeInputKeyEnum.headerSecret,
        renderTypeList: [FlowNodeInputTypeEnum.hidden],
        value: {
          'X-Reference': { ref: ['start', 'token'] }
        }
      },
      {
        key: 'password',
        renderTypeList: [FlowNodeInputTypeEnum.password]
      },
      {
        key: 'passwordRef',
        renderTypeList: [FlowNodeInputTypeEnum.password],
        selectedType: FlowNodeInputTypeEnum.reference,
        value: { ref: ['start', 'password'] }
      },
      {
        key: 'passwordTuple',
        renderTypeList: [FlowNodeInputTypeEnum.password, FlowNodeInputTypeEnum.reference],
        selectedType: FlowNodeInputTypeEnum.reference,
        value: ['start', 'password']
      },
      {
        key: 'ordinary',
        renderTypeList: [FlowNodeInputTypeEnum.input],
        value: { value: 'ordinary-value' }
      }
    ]);
    expect(JSON.stringify(filtered)).not.toContain('plain-token');
    expect(JSON.stringify(filtered)).not.toContain('cipher-token');
    expect(JSON.stringify(filtered)).not.toContain('password-cipher');
    expect(nodes[0].inputs[0].value.Authorization).toEqual({ value: 'plain-token' });
  });

  it('resets system input config when it has no secret refs', () => {
    const nodes = [
      {
        nodeId: 'tool',
        flowNodeType: FlowNodeTypeEnum.code,
        inputs: [
          {
            key: NodeInputKeyEnum.systemInputConfig,
            inputList: [
              { key: 'token', label: 'Token', inputType: 'secret' },
              { key: 'count', label: 'Count', inputType: 'numberInput' }
            ],
            value: {
              type: 'manual',
              value: {
                token: { value: 'plain-token' }
              }
            }
          }
        ],
        outputs: []
      }
    ] as any;

    const filtered = filterSensitiveNodesData(nodes);

    expect(filtered[0].inputs[0].value).toEqual({
      type: 'manual',
      value: {}
    });
    expect(isToolInputValueConfigured({ input: filtered[0].inputs[0] })).toBe(true);
    expect(JSON.stringify(filtered)).not.toContain('plain-token');
    expect(nodes[0].inputs[0].value.value.token).toEqual({ value: 'plain-token' });
  });

  it('clears system input values when the template has no secret inputs', () => {
    const nodes = [
      {
        nodeId: 'tool',
        flowNodeType: FlowNodeTypeEnum.code,
        inputs: [
          {
            key: NodeInputKeyEnum.systemInputConfig,
            inputList: [{ key: 'apiKey', label: 'API key', inputType: 'input' }],
            value: { type: 'manual', value: { apiKey: { value: 'plain-token' } } }
          }
        ],
        outputs: []
      }
    ] as any;

    const filtered = filterSensitiveNodesData(nodes);

    expect(filtered[0].inputs[0].value).toEqual({ type: 'manual', value: {} });
    expect(JSON.stringify(filtered)).not.toContain('plain-token');
  });

  it('keeps a fully configured system input configured before export', () => {
    const input = {
      key: NodeInputKeyEnum.systemInputConfig,
      label: '',
      valueType: 'any',
      selectedType: FlowNodeInputTypeEnum.hidden,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      value: {
        type: 'manual',
        value: {
          smtpHost: { value: '23' },
          smtpPort: { value: '12313' },
          SSL: { value: true },
          smtpUser: { ref: ['448745', 'userChatInput'] },
          smtpPass: { secret: 'cipher' }
        }
      },
      inputList: [
        { key: 'smtpHost', inputType: 'input' },
        { key: 'smtpPort', inputType: 'input' },
        { key: 'SSL', inputType: 'switch' },
        { key: 'smtpUser', inputType: 'input' },
        { key: 'smtpPass', inputType: 'secret' }
      ]
    } as any;

    expect(isToolInputValueConfigured({ input })).toBe(true);
  });

  it('preserves only system input secret refs', () => {
    const nodes = [
      {
        nodeId: 'tool',
        flowNodeType: FlowNodeTypeEnum.code,
        inputs: [
          {
            key: NodeInputKeyEnum.systemInputConfig,
            renderTypeList: [FlowNodeInputTypeEnum.custom],
            inputList: [
              { key: 'token', label: 'Token', inputType: 'secret' },
              { key: 'count', label: 'Count', inputType: 'numberInput' }
            ],
            value: {
              type: 'manual',
              value: {
                token: { ref: ['start', 'token'] },
                count: { value: 1 }
              }
            }
          }
        ],
        outputs: []
      }
    ] as any;

    const filtered = filterSensitiveNodesData(nodes);

    expect(filtered[0].inputs[0].value).toEqual({
      type: 'manual',
      value: {
        token: { ref: ['start', 'token'] }
      }
    });
    expect(isToolInputValueConfigured({ input: filtered[0].inputs[0] })).toBe(true);
  });

  it('treats a valid system input reference as configured', () => {
    const nodes = [
      {
        nodeId: 'tool',
        flowNodeType: FlowNodeTypeEnum.code,
        inputs: [
          {
            key: NodeInputKeyEnum.systemInputConfig,
            inputList: [{ key: 'token', label: 'Token', inputType: 'secret' }],
            value: {
              type: 'manual',
              value: { token: { ref: ['start', 'token'] } }
            }
          }
        ],
        outputs: []
      }
    ] as any;

    const filtered = filterSensitiveNodesData(nodes);

    expect(filtered[0].inputs[0].value).toEqual({
      type: 'manual',
      value: { token: { ref: ['start', 'token'] } }
    });
    expect(isToolInputValueConfigured({ input: filtered[0].inputs[0] })).toBe(true);
  });

  it('keeps system input config without a value shape unchanged', () => {
    const value = { type: 'system' };
    const nodes = [
      {
        nodeId: 'tool',
        flowNodeType: FlowNodeTypeEnum.code,
        inputs: [
          {
            key: NodeInputKeyEnum.systemInputConfig,
            inputList: [{ key: 'token', label: 'Token', inputType: 'secret' }],
            value
          }
        ],
        outputs: []
      }
    ] as any;

    expect(filterSensitiveNodesData(nodes)[0].inputs[0].value).toEqual(value);
  });
});
