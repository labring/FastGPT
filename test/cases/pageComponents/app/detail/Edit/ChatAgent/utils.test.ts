import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  appWorkflow2AgentForm,
  agentForm2AppWorkflow,
  validateToolConfiguration,
  checkNeedsUserConfiguration
} from '@/pageComponents/app/detail/Edit/ChatAgent/utils';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';

// Helper: minimal mock for FlowNodeTemplateType
function createInput(overrides: Partial<any> = {}) {
  return {
    key: 'input1',
    renderTypeList: [],
    valueType: WorkflowIOValueTypeEnum.string,
    value: '',
    ...overrides
  };
}

describe('validateToolConfiguration', () => {
  it('should return true for valid tool with no special inputs', () => {
    const toolTemplate = {
      inputs: [
        createInput({
          renderTypeList: [FlowNodeInputTypeEnum.input],
          toolDescription: 'desc'
        })
      ]
    };
    expect(validateToolConfiguration({ toolTemplate })).toBe(true);
  });

  it('should return false for reference type without toolDescription', () => {
    const toolTemplate = {
      inputs: [
        createInput({
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          toolDescription: undefined
        })
      ]
    };
    expect(validateToolConfiguration({ toolTemplate })).toBe(false);
  });

  it('should return false for input with selectDataset', () => {
    const toolTemplate = {
      inputs: [
        createInput({
          renderTypeList: [FlowNodeInputTypeEnum.selectDataset]
        })
      ]
    };
    expect(validateToolConfiguration({ toolTemplate })).toBe(false);
  });

  it('should return false for input with addInputParam', () => {
    const toolTemplate = {
      inputs: [
        createInput({
          renderTypeList: [FlowNodeInputTypeEnum.addInputParam]
        })
      ]
    };
    expect(validateToolConfiguration({ toolTemplate })).toBe(false);
  });

  it('should return false for fileSelect input if canSelectFile/canSelectImg is not set', () => {
    const toolTemplate = {
      inputs: [
        createInput({
          renderTypeList: [FlowNodeInputTypeEnum.fileSelect]
        })
      ]
    };
    expect(validateToolConfiguration({ toolTemplate })).toBe(false);
  });

  it('should return true for fileSelect input if canSelectFile is true', () => {
    const toolTemplate = {
      inputs: [
        createInput({
          renderTypeList: [FlowNodeInputTypeEnum.fileSelect]
        })
      ]
    };
    expect(validateToolConfiguration({ toolTemplate, canSelectFile: true })).toBe(true);
  });

  it('should return true for fileSelect input if canSelectImg is true', () => {
    const toolTemplate = {
      inputs: [
        createInput({
          renderTypeList: [FlowNodeInputTypeEnum.fileSelect]
        })
      ]
    };
    expect(validateToolConfiguration({ toolTemplate, canSelectImg: true })).toBe(true);
  });

  it('should return false for multiple fileSelect inputs even if canSelectFile is true', () => {
    const toolTemplate = {
      inputs: [
        createInput({ renderTypeList: [FlowNodeInputTypeEnum.fileSelect] }),
        createInput({ renderTypeList: [FlowNodeInputTypeEnum.fileSelect] })
      ]
    };
    expect(validateToolConfiguration({ toolTemplate, canSelectFile: true })).toBe(false);
  });

  it('should return true for valid tool with multiple non-conflicting inputs', () => {
    const toolTemplate = {
      inputs: [
        createInput({ renderTypeList: [FlowNodeInputTypeEnum.input], toolDescription: 'desc' }),
        createInput({ renderTypeList: [FlowNodeInputTypeEnum.switch] })
      ]
    };
    expect(validateToolConfiguration({ toolTemplate })).toBe(true);
  });
});

describe('checkNeedsUserConfiguration', () => {
  it('should return false for empty inputs', () => {
    const toolTemplate = { inputs: [] };
    expect(checkNeedsUserConfiguration(toolTemplate)).toBe(false);
  });

  it('should return false for input with toolDescription', () => {
    const toolTemplate = {
      inputs: [
        createInput({
          renderTypeList: [FlowNodeInputTypeEnum.input],
          toolDescription: 'desc'
        })
      ]
    };
    expect(checkNeedsUserConfiguration(toolTemplate)).toBe(false);
  });

  it('should return false for input with key forbidStream', () => {
    const toolTemplate = {
      inputs: [
        createInput({
          key: NodeInputKeyEnum.forbidStream,
          renderTypeList: [FlowNodeInputTypeEnum.input]
        })
      ]
    };
    expect(checkNeedsUserConfiguration(toolTemplate)).toBe(false);
  });

  it('should return true for input with key systemInputConfig', () => {
    const toolTemplate = {
      inputs: [
        createInput({
          key: NodeInputKeyEnum.systemInputConfig,
          renderTypeList: [FlowNodeInputTypeEnum.input]
        })
      ]
    };
    expect(checkNeedsUserConfiguration(toolTemplate)).toBe(true);
  });

  it('should return true for input with form renderType', () => {
    const toolTemplate = {
      inputs: [
        createInput({
          renderTypeList: [FlowNodeInputTypeEnum.input]
        })
      ]
    };
    expect(checkNeedsUserConfiguration(toolTemplate)).toBe(true);
  });

  it('should return true for input with multiple renderTypes, one is form type', () => {
    const toolTemplate = {
      inputs: [
        createInput({
          renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference]
        })
      ]
    };
    expect(checkNeedsUserConfiguration(toolTemplate)).toBe(true);
  });

  it('should return false if no form type and no special key', () => {
    const toolTemplate = {
      inputs: [
        createInput({
          renderTypeList: [FlowNodeInputTypeEnum.reference]
        })
      ]
    };
    expect(checkNeedsUserConfiguration(toolTemplate)).toBe(false);
  });

  it('should return false if inputs is undefined', () => {
    const toolTemplate = {};
    expect(checkNeedsUserConfiguration(toolTemplate as any)).toBe(false);
  });
});

describe('appWorkflow2AgentForm', () => {
  it('should map agent node values to form', () => {
    const model = 'gpt-3.5';
    const aiRole = 'assistant';
    const aiTaskObject = 'task';
    const temperature = 0.5;
    const maxHistories = 3;
    const aiChatTopP = 0.9;
    const subApps = [
      {
        id: 'tool1',
        inputs: [],
        flowNodeType: FlowNodeTypeEnum.appModule
      }
    ];

    const nodes = [
      {
        flowNodeType: FlowNodeTypeEnum.agent,
        inputs: [
          { key: NodeInputKeyEnum.aiModel, value: model },
          { key: NodeInputKeyEnum.aiRole, value: aiRole },
          { key: NodeInputKeyEnum.aiTaskObject, value: aiTaskObject },
          { key: NodeInputKeyEnum.aiChatTemperature, value: temperature },
          { key: NodeInputKeyEnum.history, value: maxHistories },
          { key: NodeInputKeyEnum.aiChatTopP, value: aiChatTopP },
          { key: NodeInputKeyEnum.subApps, value: subApps }
        ]
      }
    ];
    const chatConfig = { a: 1 };
    const form = appWorkflow2AgentForm({ nodes, chatConfig });

    expect(form.aiSettings.model).toBe(model);
    expect(form.aiSettings.aiRole).toBe(aiRole);
    expect(form.aiSettings.aiTaskObject).toBe(aiTaskObject);
    expect(form.aiSettings.temperature).toBe(temperature);
    expect(form.aiSettings.maxHistories).toBe(maxHistories);
    expect(form.aiSettings.aiChatTopP).toBe(aiChatTopP);
    expect(form.selectedTools.length).toBe(1);
    expect(form.selectedTools[0].id).toBe('tool1');
  });

  it('should set chatConfig from systemConfig node', () => {
    const nodes = [
      {
        flowNodeType: FlowNodeTypeEnum.systemConfig,
        inputs: [],
        version: 1
      }
    ];
    const chatConfig = { foo: 'bar' };
    const form = appWorkflow2AgentForm({ nodes, chatConfig });
    expect(form.chatConfig).toEqual(expect.objectContaining(chatConfig));
  });

  it('should handle missing values gracefully', () => {
    const nodes = [
      {
        flowNodeType: FlowNodeTypeEnum.agent,
        inputs: []
      }
    ];
    const chatConfig = {};
    const form = appWorkflow2AgentForm({ nodes, chatConfig });
    expect(form.aiSettings.model).toBeUndefined();
    expect(form.aiSettings.aiRole).toBeUndefined();
    expect(form.selectedTools).toEqual([]);
  });
});

describe('agentForm2AppWorkflow', () => {
  const t = (str: string) => str;

  it('should map form to workflow structure', () => {
    const data = {
      aiSettings: {
        model: 'gpt-4',
        aiRole: 'role',
        aiTaskObject: 'task',
        temperature: 0.8,
        maxHistories: 10,
        aiChatTopP: 0.7
      },
      chatConfig: { foo: 'bar' },
      selectedTools: [
        {
          id: 'tool1',
          flowNodeType: FlowNodeTypeEnum.appModule,
          inputs: [
            {
              key: NodeInputKeyEnum.forbidStream,
              renderTypeList: [FlowNodeInputTypeEnum.switch],
              value: false
            },
            {
              key: NodeInputKeyEnum.history,
              renderTypeList: [FlowNodeInputTypeEnum.numberInput],
              value: 1
            },
            {
              key: 'file',
              renderTypeList: [FlowNodeInputTypeEnum.fileSelect],
              value: null
            }
          ]
        }
      ]
    };

    const result = agentForm2AppWorkflow(data as any, t);

    // Should contain 3 nodes: systemConfig, workflowStart, agent
    expect(result.nodes.length).toBeGreaterThanOrEqual(3);
    // Should have edges
    expect(Array.isArray(result.edges)).toBe(true);

    // Check agent node fields
    const agentNode = result.nodes.find((n: any) => n.flowNodeType === FlowNodeTypeEnum.agent);
    expect(agentNode).toBeDefined();
    const inputs = agentNode.inputs;
    expect(inputs.find((i: any) => i.key === NodeInputKeyEnum.aiModel)?.value).toBe('gpt-4');
    expect(result.chatConfig).toEqual({ foo: 'bar' });

    // Check special handling of subApps/selectedTools
    const subAppsInput = inputs.find((i: any) => i.key === NodeInputKeyEnum.subApps);
    expect(
      subAppsInput.value[0].inputs.find((i: any) => i.key === NodeInputKeyEnum.forbidStream).value
    ).toBe(true);
    expect(
      subAppsInput.value[0].inputs.find((i: any) => i.key === NodeInputKeyEnum.history).value
    ).toBe(10);
    // The value should be [['workflowStartNodeId', NodeOutputKeyEnum.userFiles]]
    expect(
      subAppsInput.value[0].inputs.find((i: any) =>
        i.renderTypeList.includes(FlowNodeInputTypeEnum.fileSelect)
      ).value
    ).toEqual([['workflowStartNodeId', NodeOutputKeyEnum.userFiles]]);
  });
});
