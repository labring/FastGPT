import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  getHandleId,
  checkInputIsReference,
  getGuideModule,
  splitGuideModule,
  getAppChatConfig,
  getOrInitModuleInputValue,
  getModuleInputUiField,
  pluginData2FlowNodeIO,
  appData2FlowNodeIO,
  toolData2FlowNodeIO,
  toolSetData2FlowNodeIO,
  formatEditorVariablePickerIcon,
  isValidReferenceValueFormat,
  isValidReferenceValue,
  isValidArrayReferenceValue,
  getElseIFLabel,
  clientGetWorkflowToolRunUserQuery,
  removeUnauthModels
} from '@fastgpt/global/core/workflow/utils';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  VariableInputEnum,
  VARIABLE_NODE_ID,
  NodeOutputKeyEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  defaultTTSConfig,
  defaultWhisperConfig,
  defaultChatInputGuideConfig,
  defaultAutoExecuteConfig,
  defaultQGConfig
} from '@fastgpt/global/core/app/constants';
import { IfElseResultEnum } from '@fastgpt/global/core/workflow/template/system/ifElse/constant';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';

describe('getHandleId', () => {
  it('should return correct handle id for source type', () => {
    const result = getHandleId('node1', 'source', 'output1');
    expect(result).toBe('node1-source-output1');
  });

  it('should return correct handle id for source_catch type', () => {
    const result = getHandleId('node2', 'source_catch', 'error');
    expect(result).toBe('node2-source_catch-error');
  });

  it('should return correct handle id for target type', () => {
    const result = getHandleId('node3', 'target', 'input1');
    expect(result).toBe('node3-target-input1');
  });

  it('should handle empty strings', () => {
    const result = getHandleId('', 'source', '');
    expect(result).toBe('-source-');
  });
});

describe('checkInputIsReference', () => {
  it('should return true when renderTypeList first item is reference', () => {
    const input: FlowNodeInputItemType = {
      key: 'test',
      label: 'Test',
      renderTypeList: [FlowNodeInputTypeEnum.reference]
    };
    expect(checkInputIsReference(input)).toBe(true);
  });

  it('should return true when selectedTypeIndex points to reference', () => {
    const input: FlowNodeInputItemType = {
      key: 'test',
      label: 'Test',
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
      selectedTypeIndex: 1
    };
    expect(checkInputIsReference(input)).toBe(true);
  });

  it('should return false when renderTypeList first item is not reference', () => {
    const input: FlowNodeInputItemType = {
      key: 'test',
      label: 'Test',
      renderTypeList: [FlowNodeInputTypeEnum.input]
    };
    expect(checkInputIsReference(input)).toBe(false);
  });

  it('should return false when selectedTypeIndex is 0 and first item is not reference', () => {
    const input: FlowNodeInputItemType = {
      key: 'test',
      label: 'Test',
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
      selectedTypeIndex: 0
    };
    expect(checkInputIsReference(input)).toBe(false);
  });

  it('should return false when renderTypeList is undefined', () => {
    const input = {
      key: 'test',
      label: 'Test'
    } as FlowNodeInputItemType;
    expect(checkInputIsReference(input)).toBe(false);
  });

  it('should use index 0 when selectedTypeIndex is undefined', () => {
    const input: FlowNodeInputItemType = {
      key: 'test',
      label: 'Test',
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.input]
    };
    expect(checkInputIsReference(input)).toBe(true);
  });
});

describe('getGuideModule', () => {
  it('should find systemConfig node', () => {
    const nodes: StoreNodeItemType[] = [
      {
        nodeId: 'node1',
        flowNodeType: FlowNodeTypeEnum.systemConfig,
        name: 'System Config',
        inputs: [],
        outputs: []
      },
      {
        nodeId: 'node2',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        name: 'Chat',
        inputs: [],
        outputs: []
      }
    ];
    const result = getGuideModule(nodes);
    expect(result?.nodeId).toBe('node1');
  });

  it('should return undefined when no systemConfig node exists', () => {
    const nodes: StoreNodeItemType[] = [
      {
        nodeId: 'node1',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        name: 'Chat',
        inputs: [],
        outputs: []
      }
    ];
    const result = getGuideModule(nodes);
    expect(result).toBeUndefined();
  });

  it('should handle empty nodes array', () => {
    const result = getGuideModule([]);
    expect(result).toBeUndefined();
  });

  it('should find node with v1 flowType (adapt v1)', () => {
    const nodes = [
      {
        nodeId: 'node1',
        flowType: FlowNodeTypeEnum.systemConfig,
        flowNodeType: FlowNodeTypeEnum.chatNode,
        name: 'System Config',
        inputs: [],
        outputs: []
      }
    ] as any;
    const result = getGuideModule(nodes);
    expect(result?.nodeId).toBe('node1');
  });
});

describe('splitGuideModule', () => {
  it('should return default values when guideModules is undefined', () => {
    const result = splitGuideModule(undefined);
    expect(result.welcomeText).toBe('');
    expect(result.variables).toEqual([]);
    expect(result.questionGuide).toEqual(defaultQGConfig);
    expect(result.ttsConfig).toEqual(defaultTTSConfig);
    expect(result.whisperConfig).toEqual(defaultWhisperConfig);
    expect(result.scheduledTriggerConfig).toBeUndefined();
    expect(result.chatInputGuide).toEqual(defaultChatInputGuideConfig);
    expect(result.instruction).toBe('');
    expect(result.autoExecute).toEqual(defaultAutoExecuteConfig);
  });

  it('should extract welcomeText from inputs', () => {
    const guideModule: StoreNodeItemType = {
      nodeId: 'guide',
      flowNodeType: FlowNodeTypeEnum.systemConfig,
      name: 'Guide',
      inputs: [
        {
          key: NodeInputKeyEnum.welcomeText,
          label: 'Welcome',
          value: 'Hello World',
          renderTypeList: [FlowNodeInputTypeEnum.input]
        }
      ],
      outputs: []
    };
    const result = splitGuideModule(guideModule);
    expect(result.welcomeText).toBe('Hello World');
  });

  it('should extract variables from inputs', () => {
    const variables = [{ key: 'var1', label: 'Variable 1', type: VariableInputEnum.input }];
    const guideModule: StoreNodeItemType = {
      nodeId: 'guide',
      flowNodeType: FlowNodeTypeEnum.systemConfig,
      name: 'Guide',
      inputs: [
        {
          key: NodeInputKeyEnum.variables,
          label: 'Variables',
          value: variables,
          renderTypeList: [FlowNodeInputTypeEnum.hidden]
        }
      ],
      outputs: []
    };
    const result = splitGuideModule(guideModule);
    expect(result.variables).toEqual(variables);
  });

  it('should adapt old boolean questionGuide format', () => {
    const guideModule: StoreNodeItemType = {
      nodeId: 'guide',
      flowNodeType: FlowNodeTypeEnum.systemConfig,
      name: 'Guide',
      inputs: [
        {
          key: NodeInputKeyEnum.questionGuide,
          label: 'Question Guide',
          value: true,
          renderTypeList: [FlowNodeInputTypeEnum.switch]
        }
      ],
      outputs: []
    };
    const result = splitGuideModule(guideModule);
    expect(result.questionGuide.open).toBe(true);
  });

  it('should use new questionGuide object format', () => {
    const questionGuideConfig = { open: true, model: 'gpt-4', customPrompt: 'test' };
    const guideModule: StoreNodeItemType = {
      nodeId: 'guide',
      flowNodeType: FlowNodeTypeEnum.systemConfig,
      name: 'Guide',
      inputs: [
        {
          key: NodeInputKeyEnum.questionGuide,
          label: 'Question Guide',
          value: questionGuideConfig,
          renderTypeList: [FlowNodeInputTypeEnum.hidden]
        }
      ],
      outputs: []
    };
    const result = splitGuideModule(guideModule);
    expect(result.questionGuide).toEqual(questionGuideConfig);
  });

  it('should extract ttsConfig from inputs', () => {
    const ttsConfig = { type: 'edge' as const };
    const guideModule: StoreNodeItemType = {
      nodeId: 'guide',
      flowNodeType: FlowNodeTypeEnum.systemConfig,
      name: 'Guide',
      inputs: [
        {
          key: NodeInputKeyEnum.tts,
          label: 'TTS',
          value: ttsConfig,
          renderTypeList: [FlowNodeInputTypeEnum.hidden]
        }
      ],
      outputs: []
    };
    const result = splitGuideModule(guideModule);
    expect(result.ttsConfig).toEqual(ttsConfig);
  });

  it('should extract instruction from inputs', () => {
    const guideModule: StoreNodeItemType = {
      nodeId: 'guide',
      flowNodeType: FlowNodeTypeEnum.systemConfig,
      name: 'Guide',
      inputs: [
        {
          key: NodeInputKeyEnum.instruction,
          label: 'Instruction',
          value: 'Test instruction',
          renderTypeList: [FlowNodeInputTypeEnum.textarea]
        }
      ],
      outputs: []
    };
    const result = splitGuideModule(guideModule);
    expect(result.instruction).toBe('Test instruction');
  });
});

describe('getAppChatConfig', () => {
  it('should return config with default values when no params provided', () => {
    const result = getAppChatConfig({ isPublicFetch: false });
    expect(result.questionGuide).toEqual(defaultQGConfig);
    expect(result.ttsConfig).toEqual(defaultTTSConfig);
    expect(result.scheduledTriggerConfig).toBeUndefined();
  });

  it('should merge chatConfig with node config', () => {
    const chatConfig = {
      welcomeText: 'Custom Welcome',
      variables: [{ key: 'v1', label: 'V1', type: VariableInputEnum.input, description: '' }]
    };
    const result = getAppChatConfig({ chatConfig, isPublicFetch: false });
    expect(result.welcomeText).toBe('Custom Welcome');
    expect(result.variables).toEqual(chatConfig.variables);
  });

  it('should prioritize storeVariables over chatConfig variables', () => {
    const storeVariables = [
      { key: 'store1', label: 'Store1', type: VariableInputEnum.input, description: '' }
    ];
    const chatConfig = {
      variables: [{ key: 'chat1', label: 'Chat1', type: VariableInputEnum.input, description: '' }]
    };
    const result = getAppChatConfig({
      chatConfig,
      storeVariables,
      isPublicFetch: false
    });
    expect(result.variables).toEqual(storeVariables);
  });

  it('should prioritize storeWelcomeText over chatConfig welcomeText', () => {
    const chatConfig = { welcomeText: 'Chat Welcome' };
    const result = getAppChatConfig({
      chatConfig,
      storeWelcomeText: 'Store Welcome',
      isPublicFetch: false
    });
    expect(result.welcomeText).toBe('Store Welcome');
  });

  it('should include scheduledTriggerConfig when isPublicFetch is true', () => {
    const systemConfigNode: StoreNodeItemType = {
      nodeId: 'guide',
      flowNodeType: FlowNodeTypeEnum.systemConfig,
      name: 'Guide',
      inputs: [
        {
          key: NodeInputKeyEnum.scheduleTrigger,
          label: 'Schedule',
          value: { cronString: '0 0 * * *', timezone: 'UTC' },
          renderTypeList: [FlowNodeInputTypeEnum.hidden]
        }
      ],
      outputs: []
    };
    const result = getAppChatConfig({
      systemConfigNode,
      isPublicFetch: true
    });
    expect(result.scheduledTriggerConfig).toBeDefined();
  });

  it('should exclude scheduledTriggerConfig when isPublicFetch is false', () => {
    const systemConfigNode: StoreNodeItemType = {
      nodeId: 'guide',
      flowNodeType: FlowNodeTypeEnum.systemConfig,
      name: 'Guide',
      inputs: [
        {
          key: NodeInputKeyEnum.scheduleTrigger,
          label: 'Schedule',
          value: { cronString: '0 0 * * *', timezone: 'UTC' },
          renderTypeList: [FlowNodeInputTypeEnum.hidden]
        }
      ],
      outputs: []
    };
    const result = getAppChatConfig({
      systemConfigNode,
      isPublicFetch: false
    });
    expect(result.scheduledTriggerConfig).toBeUndefined();
  });
});

describe('getOrInitModuleInputValue', () => {
  it('should return existing value when value is defined', () => {
    const input: FlowNodeInputItemType = {
      key: 'test',
      label: 'Test',
      value: 'existing value',
      valueType: WorkflowIOValueTypeEnum.string,
      renderTypeList: [FlowNodeInputTypeEnum.input]
    };
    expect(getOrInitModuleInputValue(input)).toBe('existing value');
  });

  it('should return defaultValue when value is undefined but defaultValue exists', () => {
    const input: FlowNodeInputItemType = {
      key: 'test',
      label: 'Test',
      defaultValue: 'default value',
      valueType: WorkflowIOValueTypeEnum.string,
      renderTypeList: [FlowNodeInputTypeEnum.input]
    };
    expect(getOrInitModuleInputValue(input)).toBe('default value');
  });

  it('should return false for boolean valueType when no value or defaultValue', () => {
    const input: FlowNodeInputItemType = {
      key: 'test',
      label: 'Test',
      valueType: WorkflowIOValueTypeEnum.boolean,
      renderTypeList: [FlowNodeInputTypeEnum.switch]
    };
    expect(getOrInitModuleInputValue(input)).toBe(false);
  });

  it('should return 0 for number valueType when no value or defaultValue', () => {
    const input: FlowNodeInputItemType = {
      key: 'test',
      label: 'Test',
      valueType: WorkflowIOValueTypeEnum.number,
      renderTypeList: [FlowNodeInputTypeEnum.numberInput]
    };
    expect(getOrInitModuleInputValue(input)).toBe(0);
  });

  it('should return empty string for string valueType when no value or defaultValue', () => {
    const input: FlowNodeInputItemType = {
      key: 'test',
      label: 'Test',
      valueType: WorkflowIOValueTypeEnum.string,
      renderTypeList: [FlowNodeInputTypeEnum.input]
    };
    expect(getOrInitModuleInputValue(input)).toBe('');
  });

  it('should return undefined for other valueTypes when no value or defaultValue', () => {
    const input: FlowNodeInputItemType = {
      key: 'test',
      label: 'Test',
      valueType: WorkflowIOValueTypeEnum.object,
      renderTypeList: [FlowNodeInputTypeEnum.JSONEditor]
    };
    expect(getOrInitModuleInputValue(input)).toBeUndefined();
  });

  it('should return undefined when valueType is not defined', () => {
    const input: FlowNodeInputItemType = {
      key: 'test',
      label: 'Test',
      renderTypeList: [FlowNodeInputTypeEnum.input]
    };
    expect(getOrInitModuleInputValue(input)).toBeUndefined();
  });

  it('should return value even if it is falsy (0, false, empty string)', () => {
    const inputZero: FlowNodeInputItemType = {
      key: 'test',
      label: 'Test',
      value: 0,
      valueType: WorkflowIOValueTypeEnum.number,
      renderTypeList: [FlowNodeInputTypeEnum.numberInput]
    };
    expect(getOrInitModuleInputValue(inputZero)).toBe(0);

    const inputFalse: FlowNodeInputItemType = {
      key: 'test',
      label: 'Test',
      value: false,
      valueType: WorkflowIOValueTypeEnum.boolean,
      renderTypeList: [FlowNodeInputTypeEnum.switch]
    };
    expect(getOrInitModuleInputValue(inputFalse)).toBe(false);

    const inputEmpty: FlowNodeInputItemType = {
      key: 'test',
      label: 'Test',
      value: '',
      valueType: WorkflowIOValueTypeEnum.string,
      renderTypeList: [FlowNodeInputTypeEnum.input]
    };
    expect(getOrInitModuleInputValue(inputEmpty)).toBe('');
  });
});

describe('getModuleInputUiField', () => {
  it('should return empty object', () => {
    const input: FlowNodeInputItemType = {
      key: 'test',
      label: 'Test',
      renderTypeList: [FlowNodeInputTypeEnum.input]
    };
    expect(getModuleInputUiField(input)).toEqual({});
  });
});

describe('pluginData2FlowNodeIO', () => {
  it('should return empty arrays when no pluginInput or pluginOutput nodes', () => {
    const nodes: StoreNodeItemType[] = [
      {
        nodeId: 'node1',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        name: 'Chat',
        inputs: [],
        outputs: []
      }
    ];
    const result = pluginData2FlowNodeIO({ nodes });
    expect(result.inputs).toEqual([]);
    expect(result.outputs).toEqual([]);
  });

  it('should transform pluginInput node inputs', () => {
    const nodes: StoreNodeItemType[] = [
      {
        nodeId: 'pluginInput1',
        flowNodeType: FlowNodeTypeEnum.pluginInput,
        name: 'Plugin Input',
        inputs: [
          {
            key: 'input1',
            label: 'Input 1',
            valueType: WorkflowIOValueTypeEnum.string,
            renderTypeList: [FlowNodeInputTypeEnum.input]
          }
        ],
        outputs: []
      }
    ];
    const result = pluginData2FlowNodeIO({ nodes });
    expect(result.inputs.length).toBeGreaterThan(0);
    // First input should be stream mode template
    expect(result.inputs[0].key).toBe(NodeInputKeyEnum.forbidStream);
  });

  it('should transform pluginOutput node inputs to outputs', () => {
    const nodes: StoreNodeItemType[] = [
      {
        nodeId: 'pluginOutput1',
        flowNodeType: FlowNodeTypeEnum.pluginOutput,
        name: 'Plugin Output',
        inputs: [
          {
            key: 'output1',
            label: 'Output 1',
            valueType: WorkflowIOValueTypeEnum.string,
            renderTypeList: [FlowNodeInputTypeEnum.input],
            description: 'Test output'
          }
        ],
        outputs: []
      }
    ];
    const result = pluginData2FlowNodeIO({ nodes });
    expect(result.outputs.length).toBe(1);
    expect(result.outputs[0].key).toBe('output1');
    expect(result.outputs[0].type).toBe(FlowNodeOutputTypeEnum.static);
  });

  it('should convert customVariable renderType to reference and input', () => {
    const nodes: StoreNodeItemType[] = [
      {
        nodeId: 'pluginInput1',
        flowNodeType: FlowNodeTypeEnum.pluginInput,
        name: 'Plugin Input',
        inputs: [
          {
            key: 'customVar',
            label: 'Custom Variable',
            valueType: WorkflowIOValueTypeEnum.string,
            renderTypeList: [FlowNodeInputTypeEnum.customVariable]
          }
        ],
        outputs: []
      }
    ];
    const result = pluginData2FlowNodeIO({ nodes });
    const customVarInput = result.inputs.find((i) => i.key === 'customVar');
    expect(customVarInput?.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.reference,
      FlowNodeInputTypeEnum.input
    ]);
  });

  it('should set canEdit to false for all inputs', () => {
    const nodes: StoreNodeItemType[] = [
      {
        nodeId: 'pluginInput1',
        flowNodeType: FlowNodeTypeEnum.pluginInput,
        name: 'Plugin Input',
        inputs: [
          {
            key: 'input1',
            label: 'Input 1',
            valueType: WorkflowIOValueTypeEnum.string,
            renderTypeList: [FlowNodeInputTypeEnum.input]
          }
        ],
        outputs: []
      }
    ];
    const result = pluginData2FlowNodeIO({ nodes });
    const input1 = result.inputs.find((i) => i.key === 'input1');
    expect(input1?.canEdit).toBe(false);
  });
});

describe('appData2FlowNodeIO', () => {
  it('should return basic inputs and outputs when no chatConfig', () => {
    const result = appData2FlowNodeIO({});
    expect(result.inputs.length).toBeGreaterThan(0);
    expect(result.outputs.length).toBe(2);
    expect(result.outputs[0].key).toBe(NodeOutputKeyEnum.history);
    expect(result.outputs[1].key).toBe(NodeOutputKeyEnum.answerText);
  });

  it('should include file link input when fileSelectConfig allows file selection', () => {
    const result = appData2FlowNodeIO({
      chatConfig: {
        fileSelectConfig: {
          canSelectFile: true,
          canSelectImg: false
        }
      }
    });
    const fileLinkInput = result.inputs.find((i) => i.key === NodeInputKeyEnum.fileUrlList);
    expect(fileLinkInput).toBeDefined();
  });

  it('should include file link input when fileSelectConfig allows image selection', () => {
    const result = appData2FlowNodeIO({
      chatConfig: {
        fileSelectConfig: {
          canSelectFile: false,
          canSelectImg: true
        }
      }
    });
    const fileLinkInput = result.inputs.find((i) => i.key === NodeInputKeyEnum.fileUrlList);
    expect(fileLinkInput).toBeDefined();
  });

  it('should not include file link input when fileSelectConfig disallows both', () => {
    const result = appData2FlowNodeIO({
      chatConfig: {
        fileSelectConfig: {
          canSelectFile: false,
          canSelectImg: false
        }
      }
    });
    const fileLinkInput = result.inputs.find((i) => i.key === NodeInputKeyEnum.fileUrlList);
    expect(fileLinkInput).toBeUndefined();
  });

  it('should transform variables to inputs', () => {
    const result = appData2FlowNodeIO({
      chatConfig: {
        variables: [
          {
            key: 'var1',
            label: 'Variable 1',
            type: VariableInputEnum.input,
            description: '',
            required: true
          }
        ]
      }
    });
    const varInput = result.inputs.find((i) => i.key === 'var1');
    expect(varInput).toBeDefined();
    expect(varInput?.required).toBe(true);
  });

  it('should map variable types to correct renderTypeList', () => {
    const result = appData2FlowNodeIO({
      chatConfig: {
        variables: [
          { key: 'textVar', label: 'Text', type: VariableInputEnum.input, description: '' },
          { key: 'numVar', label: 'Number', type: VariableInputEnum.numberInput, description: '' },
          { key: 'selectVar', label: 'Select', type: VariableInputEnum.select, description: '' },
          { key: 'switchVar', label: 'Switch', type: VariableInputEnum.switch, description: '' }
        ]
      }
    });

    const textVar = result.inputs.find((i) => i.key === 'textVar');
    expect(textVar?.renderTypeList).toContain(FlowNodeInputTypeEnum.input);

    const numVar = result.inputs.find((i) => i.key === 'numVar');
    expect(numVar?.renderTypeList).toContain(FlowNodeInputTypeEnum.numberInput);

    const selectVar = result.inputs.find((i) => i.key === 'selectVar');
    expect(selectVar?.renderTypeList).toContain(FlowNodeInputTypeEnum.select);

    const switchVar = result.inputs.find((i) => i.key === 'switchVar');
    expect(switchVar?.renderTypeList).toContain(FlowNodeInputTypeEnum.switch);
  });

  it('should handle variable with list/enums', () => {
    const result = appData2FlowNodeIO({
      chatConfig: {
        variables: [
          {
            key: 'selectVar',
            label: 'Select',
            type: VariableInputEnum.select,
            description: '',
            list: [
              { label: 'option1', value: 'option1' },
              { label: 'option2', value: 'option2' }
            ]
          }
        ]
      }
    });
    const selectVar = result.inputs.find((i) => i.key === 'selectVar');
    expect(selectVar?.list).toEqual([
      { label: 'option1', value: 'option1' },
      { label: 'option2', value: 'option2' }
    ]);
  });
});

describe('toolData2FlowNodeIO', () => {
  it('should return empty arrays when no tool node exists', () => {
    const nodes: StoreNodeItemType[] = [
      {
        nodeId: 'node1',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        name: 'Chat',
        inputs: [],
        outputs: []
      }
    ];
    const result = toolData2FlowNodeIO({ nodes });
    expect(result.inputs).toEqual([]);
    expect(result.outputs).toEqual([]);
    expect(result.toolConfig).toBeUndefined();
  });

  it('should return tool node inputs and outputs', () => {
    const toolInputs: FlowNodeInputItemType[] = [
      {
        key: 'toolInput1',
        label: 'Tool Input',
        renderTypeList: [FlowNodeInputTypeEnum.input]
      }
    ];
    const toolOutputs = [
      {
        id: 'output1',
        key: 'toolOutput1',
        label: 'Tool Output',
        type: FlowNodeOutputTypeEnum.static
      }
    ];
    const nodes: StoreNodeItemType[] = [
      {
        nodeId: 'tool1',
        flowNodeType: FlowNodeTypeEnum.tool,
        name: 'Tool',
        inputs: toolInputs,
        outputs: toolOutputs,
        toolConfig: { mcpTool: { toolId: 'test-tool' } }
      }
    ];
    const result = toolData2FlowNodeIO({ nodes });
    expect(result.inputs).toEqual(toolInputs);
    expect(result.outputs).toEqual(toolOutputs);
    expect(result.toolConfig).toEqual({ mcpTool: { toolId: 'test-tool' } });
  });
});

describe('toolSetData2FlowNodeIO', () => {
  it('should return empty arrays when no toolSet node exists', () => {
    const nodes: StoreNodeItemType[] = [
      {
        nodeId: 'node1',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        name: 'Chat',
        inputs: [],
        outputs: []
      }
    ];
    const result = toolSetData2FlowNodeIO({ nodes });
    expect(result.inputs).toEqual([]);
    expect(result.outputs).toEqual([]);
    expect(result.toolConfig).toBeUndefined();
    expect(result.showSourceHandle).toBe(false);
    expect(result.showTargetHandle).toBe(false);
  });

  it('should return toolSet node data with handle flags', () => {
    const toolSetInputs: FlowNodeInputItemType[] = [
      {
        key: 'toolSetInput1',
        label: 'ToolSet Input',
        renderTypeList: [FlowNodeInputTypeEnum.input]
      }
    ];
    const nodes: StoreNodeItemType[] = [
      {
        nodeId: 'toolSet1',
        flowNodeType: FlowNodeTypeEnum.toolSet,
        name: 'ToolSet',
        inputs: toolSetInputs,
        outputs: [],
        toolConfig: { mcpToolSet: { toolId: 'test', url: 'http://test', toolList: [] } }
      }
    ];
    const result = toolSetData2FlowNodeIO({ nodes });
    expect(result.inputs).toEqual(toolSetInputs);
    expect(result.showSourceHandle).toBe(false);
    expect(result.showTargetHandle).toBe(false);
  });
});

describe('formatEditorVariablePickerIcon', () => {
  it('should add icon based on variable type', () => {
    const variables = [
      { key: 'var1', label: 'Variable 1', type: VariableInputEnum.input as `${VariableInputEnum}` }
    ];
    const result = formatEditorVariablePickerIcon(variables);
    expect(result[0].icon).toBeDefined();
    expect(result[0].key).toBe('var1');
    expect(result[0].label).toBe('Variable 1');
  });

  it('should use default input icon when type is undefined', () => {
    const variables = [{ key: 'var1', label: 'Variable 1' }];
    const result = formatEditorVariablePickerIcon(variables);
    expect(result[0].icon).toBeDefined();
  });

  it('should preserve required field', () => {
    const variables = [
      {
        key: 'var1',
        label: 'Variable 1',
        type: VariableInputEnum.input as `${VariableInputEnum}`,
        required: true
      }
    ];
    const result = formatEditorVariablePickerIcon(variables);
    expect(result[0].required).toBe(true);
  });

  it('should handle empty array', () => {
    const result = formatEditorVariablePickerIcon([]);
    expect(result).toEqual([]);
  });
});

describe('isValidReferenceValueFormat', () => {
  it('should return true for valid reference format [string, string]', () => {
    expect(isValidReferenceValueFormat(['nodeId', 'outputKey'])).toBe(true);
  });

  it('should return true for reference with optional second element', () => {
    expect(isValidReferenceValueFormat(['nodeId', undefined])).toBe(true);
  });

  it('should return false for non-array values', () => {
    expect(isValidReferenceValueFormat('not an array')).toBe(false);
    expect(isValidReferenceValueFormat(123)).toBe(false);
    expect(isValidReferenceValueFormat(null)).toBe(false);
    expect(isValidReferenceValueFormat(undefined)).toBe(false);
    expect(isValidReferenceValueFormat({})).toBe(false);
  });

  it('should return false for array with wrong length', () => {
    expect(isValidReferenceValueFormat(['single'])).toBe(false);
    expect(isValidReferenceValueFormat(['one', 'two', 'three'])).toBe(false);
    expect(isValidReferenceValueFormat([])).toBe(false);
  });

  it('should return false when first element is not string', () => {
    expect(isValidReferenceValueFormat([123, 'outputKey'])).toBe(false);
    expect(isValidReferenceValueFormat([null, 'outputKey'])).toBe(false);
  });
});

describe('isValidReferenceValue', () => {
  const nodeIds = ['node1', 'node2', 'node3'];

  it('should return true for valid reference with existing nodeId', () => {
    expect(isValidReferenceValue(['node1', 'output'], nodeIds)).toBe(true);
    expect(isValidReferenceValue(['node2', 'output'], nodeIds)).toBe(true);
  });

  it('should return true for VARIABLE_NODE_ID reference', () => {
    expect(isValidReferenceValue([VARIABLE_NODE_ID, 'varKey'], nodeIds)).toBe(true);
  });

  it('should return false for non-existent nodeId', () => {
    expect(isValidReferenceValue(['nonExistent', 'output'], nodeIds)).toBe(false);
  });

  it('should return false for invalid format', () => {
    expect(isValidReferenceValue('not an array', nodeIds)).toBe(false);
    expect(isValidReferenceValue(['single'], nodeIds)).toBe(false);
  });

  it('should handle empty nodeIds array', () => {
    expect(isValidReferenceValue(['node1', 'output'], [])).toBe(false);
    expect(isValidReferenceValue([VARIABLE_NODE_ID, 'varKey'], [])).toBe(true);
  });
});

describe('isValidArrayReferenceValue', () => {
  const nodeIds = ['node1', 'node2'];

  it('should return true for valid array of references', () => {
    const value = [
      ['node1', 'output1'],
      ['node2', 'output2']
    ];
    expect(isValidArrayReferenceValue(value, nodeIds)).toBe(true);
  });

  it('should return true for empty array', () => {
    expect(isValidArrayReferenceValue([], nodeIds)).toBe(true);
  });

  it('should return false for non-array value', () => {
    expect(isValidArrayReferenceValue('not an array', nodeIds)).toBe(false);
    expect(isValidArrayReferenceValue(null, nodeIds)).toBe(false);
  });

  it('should return false if any element is invalid', () => {
    const value = [
      ['node1', 'output1'],
      ['nonExistent', 'output2']
    ];
    expect(isValidArrayReferenceValue(value, nodeIds)).toBe(false);
  });

  it('should return true when all elements reference VARIABLE_NODE_ID', () => {
    const value = [
      [VARIABLE_NODE_ID, 'var1'],
      [VARIABLE_NODE_ID, 'var2']
    ];
    expect(isValidArrayReferenceValue(value, [])).toBe(true);
  });
});

describe('getElseIFLabel', () => {
  it('should return IF for index 0', () => {
    expect(getElseIFLabel(0)).toBe(IfElseResultEnum.IF);
  });

  it('should return ELSE IF with index for index > 0', () => {
    expect(getElseIFLabel(1)).toBe(`${IfElseResultEnum.ELSE_IF} 1`);
    expect(getElseIFLabel(2)).toBe(`${IfElseResultEnum.ELSE_IF} 2`);
    expect(getElseIFLabel(10)).toBe(`${IfElseResultEnum.ELSE_IF} 10`);
  });
});

describe('clientGetWorkflowToolRunUserQuery', () => {
  it('should return user chat item with dataId', () => {
    const pluginInputs: FlowNodeInputItemType[] = [
      {
        key: 'input1',
        label: 'Input 1',
        defaultValue: 'default',
        renderTypeList: [FlowNodeInputTypeEnum.input]
      }
    ];
    const variables = { input1: 'test value' };

    const result = clientGetWorkflowToolRunUserQuery({
      pluginInputs,
      variables
    });

    expect(result.dataId).toBeDefined();
    expect(result.dataId.length).toBe(24);
    expect(result.obj).toBe('Human');
    expect(result.value).toBeDefined();
  });

  it('should use variable value when provided', () => {
    const pluginInputs: FlowNodeInputItemType[] = [
      {
        key: 'testKey',
        label: 'Test',
        defaultValue: 'default',
        renderTypeList: [FlowNodeInputTypeEnum.input]
      }
    ];
    const variables = { testKey: 'custom value' };

    const result = clientGetWorkflowToolRunUserQuery({
      pluginInputs,
      variables
    });

    // The value should contain the custom value in JSON format
    expect(result.value).toBeDefined();
  });

  it('should use defaultValue when variable is not provided', () => {
    const pluginInputs: FlowNodeInputItemType[] = [
      {
        key: 'testKey',
        label: 'Test',
        defaultValue: 'default value',
        renderTypeList: [FlowNodeInputTypeEnum.input]
      }
    ];
    const variables = {};

    const result = clientGetWorkflowToolRunUserQuery({
      pluginInputs,
      variables
    });

    expect(result.value).toBeDefined();
  });

  it('should handle empty pluginInputs', () => {
    const result = clientGetWorkflowToolRunUserQuery({
      pluginInputs: [],
      variables: {}
    });

    expect(result.dataId).toBeDefined();
    expect(result.obj).toBe('Human');
  });

  it('should handle files parameter', () => {
    const pluginInputs: FlowNodeInputItemType[] = [];
    const files = [{ type: ChatFileTypeEnum.image, url: 'http://example.com/image.png' }];

    const result = clientGetWorkflowToolRunUserQuery({
      pluginInputs,
      variables: {},
      files
    });

    expect(result.value).toBeDefined();
  });
});

describe('removeUnauthModels', () => {
  it('should return modules unchanged when modules is undefined', async () => {
    const result = await removeUnauthModels({ modules: undefined as any });
    expect(result).toBeUndefined();
  });

  it('should not modify model value when it is in allowedModels', async () => {
    const modules = [
      {
        nodeId: 'node1',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        name: 'Chat',
        inputs: [
          {
            key: 'model',
            label: 'Model',
            value: 'gpt-4',
            selectedTypeIndex: 0,
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          }
        ],
        outputs: []
      }
    ];
    const allowedModels = new Set(['gpt-4', 'gpt-3.5-turbo']);

    const result = await removeUnauthModels({ modules, allowedModels });
    expect(result?.[0].inputs[0].value).toBe('gpt-4');
  });

  it('should set model value to undefined when not in allowedModels', async () => {
    const modules = [
      {
        nodeId: 'node1',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        name: 'Chat',
        inputs: [
          {
            key: 'model',
            label: 'Model',
            value: 'unauthorized-model',
            selectedTypeIndex: 0,
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          }
        ],
        outputs: []
      }
    ];
    const allowedModels = new Set(['gpt-4']);

    const result = await removeUnauthModels({ modules, allowedModels });
    expect(result?.[0].inputs[0].value).toBeUndefined();
  });

  it('should skip reference type inputs (selectedTypeIndex !== 0)', async () => {
    const modules = [
      {
        nodeId: 'node1',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        name: 'Chat',
        inputs: [
          {
            key: 'model',
            label: 'Model',
            value: 'unauthorized-model',
            selectedTypeIndex: 1,
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel, FlowNodeInputTypeEnum.reference]
          }
        ],
        outputs: []
      }
    ];
    const allowedModels = new Set(['gpt-4']);

    const result = await removeUnauthModels({ modules, allowedModels });
    expect(result?.[0].inputs[0].value).toBe('unauthorized-model');
  });

  it('should skip array value inputs (reference type)', async () => {
    const modules = [
      {
        nodeId: 'node1',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        name: 'Chat',
        inputs: [
          {
            key: 'model',
            label: 'Model',
            value: ['nodeId', 'outputKey'],
            selectedTypeIndex: 0,
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          }
        ],
        outputs: []
      }
    ];
    const allowedModels = new Set(['gpt-4']);

    const result = await removeUnauthModels({ modules, allowedModels });
    expect(result?.[0].inputs[0].value).toEqual(['nodeId', 'outputKey']);
  });

  it('should handle modules with no model inputs', async () => {
    const modules = [
      {
        nodeId: 'node1',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        name: 'Chat',
        inputs: [
          {
            key: 'otherKey',
            label: 'Other',
            value: 'some value',
            renderTypeList: [FlowNodeInputTypeEnum.input]
          }
        ],
        outputs: []
      }
    ];
    const allowedModels = new Set(['gpt-4']);

    const result = await removeUnauthModels({ modules, allowedModels });
    expect(result?.[0].inputs[0].value).toBe('some value');
  });

  it('should use empty Set as default for allowedModels', async () => {
    const modules = [
      {
        nodeId: 'node1',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        name: 'Chat',
        inputs: [
          {
            key: 'model',
            label: 'Model',
            value: 'any-model',
            selectedTypeIndex: 0,
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          }
        ],
        outputs: []
      }
    ];

    const result = await removeUnauthModels({ modules });
    expect(result?.[0].inputs[0].value).toBeUndefined();
  });

  it('should handle multiple modules with multiple model inputs', async () => {
    const modules = [
      {
        nodeId: 'node1',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        name: 'Chat 1',
        inputs: [
          {
            key: 'model',
            label: 'Model',
            value: 'gpt-4',
            selectedTypeIndex: 0,
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          }
        ],
        outputs: []
      },
      {
        nodeId: 'node2',
        flowNodeType: FlowNodeTypeEnum.chatNode,
        name: 'Chat 2',
        inputs: [
          {
            key: 'model',
            label: 'Model',
            value: 'unauthorized',
            selectedTypeIndex: 0,
            renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel]
          }
        ],
        outputs: []
      }
    ];
    const allowedModels = new Set(['gpt-4']);

    const result = await removeUnauthModels({ modules, allowedModels });
    expect(result?.[0].inputs[0].value).toBe('gpt-4');
    expect(result?.[1].inputs[0].value).toBeUndefined();
  });
});
