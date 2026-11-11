import { describe, expect, it } from 'vitest';
import { splitToolInputsByMode } from '@/web/core/workflow/utils';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { ToolCallNode } from '@fastgpt/global/core/workflow/template/system/toolCall';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { filterSensitiveNodesData } from '@/web/core/workflow/utils';

describe('splitToolInputsByMode', () => {
  it('keeps Agent-generated editable inputs out of common inputs', () => {
    const toolInput = {
      key: 'query',
      label: 'query',
      canEdit: true,
      toolDescription: 'Search query',
      defaultToAgentGenerated: true,
      renderTypeList: [FlowNodeInputTypeEnum.reference]
    };
    const commonInput = {
      key: 'url',
      label: 'url',
      renderTypeList: [FlowNodeInputTypeEnum.reference]
    };

    const result = splitToolInputsByMode([toolInput, commonInput], true);

    expect(result.toolInputs).toEqual([toolInput]);
    expect(result.commonInputs.map((input) => input.key)).toEqual(['url']);
  });

  it('keeps manually configured editable tool params in tool inputs', () => {
    const toolInput = {
      key: 'query',
      label: 'query',
      canEdit: true,
      defaultToAgentGenerated: true,
      selectedType: FlowNodeInputTypeEnum.input,
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]
    };

    const result = splitToolInputsByMode([toolInput], true);

    expect(result.toolInputs).toEqual([toolInput]);
    expect(result.commonInputs).toEqual([]);
  });

  it('does not expose AI mode for an input that is not a tool parameter', () => {
    const input = {
      key: 'query',
      label: 'query',
      canEdit: true,
      canAgentGenerated: false,
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]
    };

    const result = splitToolInputsByMode([input], true);

    expect(result.commonInputs[0].renderTypeList).not.toContain(
      FlowNodeInputTypeEnum.agentGenerated
    );
    expect(result.commonInputs[0].selectedType).toBe(FlowNodeInputTypeEnum.input);
  });

  it('keeps unmarked editable inputs as code custom variables', () => {
    const customVariable = {
      key: 'codeInput',
      label: 'codeInput',
      canEdit: true,
      renderTypeList: [FlowNodeInputTypeEnum.reference]
    };

    const result = splitToolInputsByMode([customVariable], true);

    expect(result.toolInputs).toEqual([]);
    expect(result.commonInputs.map((input) => input.key)).toEqual(['codeInput']);
  });

  it('keeps the same input in common inputs when it is not a tool', () => {
    const input = {
      key: 'query',
      label: 'query',
      canEdit: true,
      toolDescription: 'Search query',
      defaultToAgentGenerated: true,
      renderTypeList: [FlowNodeInputTypeEnum.reference]
    };

    const result = splitToolInputsByMode([input], false);

    expect(result.toolInputs).toEqual([]);
    expect(result.commonInputs).toHaveLength(1);
  });

  it('keeps fixed tool inputs in the node and defaults the marked inputs to AI generation', () => {
    const toolCallInputs = splitToolInputsByMode(ToolCallNode.inputs, true).commonInputs;

    toolCallInputs
      .filter((input) =>
        [
          NodeInputKeyEnum.aiSystemPrompt,
          NodeInputKeyEnum.history,
          NodeInputKeyEnum.fileUrlList,
          NodeInputKeyEnum.userChatInput
        ].includes(input.key as NodeInputKeyEnum)
      )
      .forEach((input) => {
        expect(input.renderTypeList).toContain(FlowNodeInputTypeEnum.agentGenerated);
      });
    expect(
      toolCallInputs.find((input) => input.key === NodeInputKeyEnum.userChatInput)?.selectedType
    ).toBe(FlowNodeInputTypeEnum.agentGenerated);
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
