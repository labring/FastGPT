import { describe, expect, it } from 'vitest';
import {
  getHandleId,
  getSelectedInputRenderType,
  nodeInputIsReference,
  getAppChatConfig,
  getOrInitModuleInputValue,
  getModuleInputUiField,
  pluginData2FlowNodeIO,
  appData2FlowNodeIO,
  projectExternalVariableInput,
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
import {
  getIfElseBranchHandleKey,
  initNewIfElseList
} from '@fastgpt/global/core/workflow/template/system/ifElse/utils';
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

describe('projectExternalVariableInput', () => {
  it.each([
    [WorkflowIOValueTypeEnum.string, FlowNodeInputTypeEnum.input, true],
    [WorkflowIOValueTypeEnum.number, FlowNodeInputTypeEnum.numberInput, true],
    [WorkflowIOValueTypeEnum.boolean, FlowNodeInputTypeEnum.switch, true],
    [WorkflowIOValueTypeEnum.arrayString, FlowNodeInputTypeEnum.JSONEditor, true],
    [WorkflowIOValueTypeEnum.arrayNumber, FlowNodeInputTypeEnum.JSONEditor, true],
    [WorkflowIOValueTypeEnum.arrayBoolean, FlowNodeInputTypeEnum.JSONEditor, true],
    [WorkflowIOValueTypeEnum.object, FlowNodeInputTypeEnum.JSONEditor, false],
    [WorkflowIOValueTypeEnum.arrayObject, FlowNodeInputTypeEnum.JSONEditor, false],
    [WorkflowIOValueTypeEnum.arrayAny, FlowNodeInputTypeEnum.JSONEditor, false],
    [WorkflowIOValueTypeEnum.any, FlowNodeInputTypeEnum.JSONEditor, false]
  ])(
    'should project %s external variables to a reference and manual input',
    (valueType, type, canAgentGenerated) => {
      const result = projectExternalVariableInput({
        key: 'externalVariable',
        label: 'External variable',
        valueType,
        renderTypeList: [FlowNodeInputTypeEnum.customVariable],
        selectedType: FlowNodeInputTypeEnum.customVariable,
        defaultValue: 'default-value'
      });

      expect(result).toMatchObject({
        canAgentGenerated,
        ...(canAgentGenerated ? { defaultToAgentGenerated: true } : {}),
        renderTypeList: [
          ...(canAgentGenerated ? [FlowNodeInputTypeEnum.agentGenerated] : []),
          FlowNodeInputTypeEnum.reference,
          type
        ],
        selectedType: canAgentGenerated
          ? FlowNodeInputTypeEnum.agentGenerated
          : FlowNodeInputTypeEnum.reference,
        defaultValue: 'default-value'
      });
    }
  );

  it('should leave regular inputs unchanged', () => {
    const input: FlowNodeInputItemType = {
      key: 'query',
      label: 'Query',
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]
    };

    expect(projectExternalVariableInput(input)).toBe(input);
  });

  it('should allow AI generation for primitive external variables', () => {
    const result = projectExternalVariableInput({
      key: 'externalVariable',
      label: 'External variable',
      valueType: WorkflowIOValueTypeEnum.string,
      renderTypeList: [FlowNodeInputTypeEnum.agentGenerated, FlowNodeInputTypeEnum.customVariable],
      selectedType: FlowNodeInputTypeEnum.agentGenerated
    });

    expect(result).toMatchObject({
      canAgentGenerated: true,
      renderTypeList: [
        FlowNodeInputTypeEnum.agentGenerated,
        FlowNodeInputTypeEnum.reference,
        FlowNodeInputTypeEnum.input
      ],
      selectedType: FlowNodeInputTypeEnum.agentGenerated
    });
  });

  it('should select AI generation by default without changing its existing position', () => {
    const result = projectExternalVariableInput({
      key: 'externalVariable',
      label: 'External variable',
      valueType: WorkflowIOValueTypeEnum.string,
      renderTypeList: [FlowNodeInputTypeEnum.customVariable, FlowNodeInputTypeEnum.agentGenerated],
      selectedType: FlowNodeInputTypeEnum.customVariable
    });

    expect(result.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.reference,
      FlowNodeInputTypeEnum.input,
      FlowNodeInputTypeEnum.agentGenerated
    ]);
    expect(result.selectedType).toBe(FlowNodeInputTypeEnum.agentGenerated);
  });

  it.each([FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.input])(
    'should preserve an explicit %s selection when projecting an external variable',
    (selectedType) => {
      const result = projectExternalVariableInput({
        key: 'externalVariable',
        label: 'External variable',
        valueType: WorkflowIOValueTypeEnum.string,
        renderTypeList: [
          FlowNodeInputTypeEnum.customVariable,
          FlowNodeInputTypeEnum.reference,
          FlowNodeInputTypeEnum.input
        ],
        selectedType
      });

      expect(result.renderTypeList).toEqual([
        FlowNodeInputTypeEnum.agentGenerated,
        FlowNodeInputTypeEnum.reference,
        FlowNodeInputTypeEnum.input
      ]);
      expect(result.selectedType).toBe(selectedType);
    }
  );

  it('should default a projected external variable without a saved selection to AI generation', () => {
    const result = projectExternalVariableInput({
      key: 'externalVariable',
      label: 'External variable',
      valueType: WorkflowIOValueTypeEnum.string,
      renderTypeList: [FlowNodeInputTypeEnum.customVariable]
    });

    expect(result.selectedType).toBe(FlowNodeInputTypeEnum.agentGenerated);
  });

  it('should keep complex external variables manual-only', () => {
    const result = projectExternalVariableInput({
      key: 'externalVariable',
      label: 'External variable',
      valueType: WorkflowIOValueTypeEnum.object,
      renderTypeList: [FlowNodeInputTypeEnum.customVariable],
      selectedType: FlowNodeInputTypeEnum.customVariable
    });

    expect(result).toMatchObject({
      canAgentGenerated: false,
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.JSONEditor],
      selectedType: FlowNodeInputTypeEnum.reference
    });
  });
});

describe('nodeInputIsReference', () => {
  it('should use the canonical selectedType', () => {
    const input: FlowNodeInputItemType = {
      key: 'test',
      label: 'Test',
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
      selectedType: FlowNodeInputTypeEnum.reference
    };

    expect(getSelectedInputRenderType(input)).toBe(FlowNodeInputTypeEnum.reference);
    expect(nodeInputIsReference(input)).toBe(true);
  });

  it('should return false when renderTypeList first item is not reference', () => {
    const input: FlowNodeInputItemType = {
      key: 'test',
      label: 'Test',
      renderTypeList: [FlowNodeInputTypeEnum.input]
    };
    expect(nodeInputIsReference(input)).toBe(false);
  });

  it('should return false when the current selected type is not a reference', () => {
    const input: FlowNodeInputItemType = {
      key: 'test',
      label: 'Test',
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
      selectedType: FlowNodeInputTypeEnum.input
    };
    expect(nodeInputIsReference(input)).toBe(false);
  });

  it('should return false when renderTypeList is undefined', () => {
    const input = {
      key: 'test',
      label: 'Test'
    } as FlowNodeInputItemType;
    expect(nodeInputIsReference(input)).toBe(false);
  });

  it('should default to the first current render type when selectedType is absent', () => {
    const input: FlowNodeInputItemType = {
      key: 'test',
      label: 'Test',
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.input]
    };
    expect(nodeInputIsReference(input)).toBe(true);
  });

  it('should treat settingDatasetQuotePrompt as reference', () => {
    const input: FlowNodeInputItemType = {
      key: NodeInputKeyEnum.aiChatDatasetQuote,
      label: 'Dataset quote',
      renderTypeList: [FlowNodeInputTypeEnum.settingDatasetQuotePrompt],
      valueType: WorkflowIOValueTypeEnum.datasetQuote
    };
    expect(nodeInputIsReference(input)).toBe(true);
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
    expect(result.variables).toEqual([
      { ...chatConfig.variables[0], valueType: WorkflowIOValueTypeEnum.string }
    ]);
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
    expect(result.variables).toEqual([
      { ...storeVariables[0], valueType: WorkflowIOValueTypeEnum.string }
    ]);
  });

  it('rejects malformed stored variables before returning chat config', () => {
    expect(() =>
      getAppChatConfig({
        storeVariables: [{ key: 'broken' }] as any,
        isPublicFetch: false
      })
    ).toThrow();
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
    const result = getAppChatConfig({
      chatConfig: {
        scheduledTriggerConfig: {
          cronString: '0 0 * * *',
          timezone: 'UTC',
          defaultPrompt: 'Run'
        }
      },
      isPublicFetch: true
    });
    expect(result.scheduledTriggerConfig).toBeDefined();
  });

  it('should exclude scheduledTriggerConfig when isPublicFetch is false', () => {
    const result = getAppChatConfig({
      chatConfig: {
        scheduledTriggerConfig: {
          cronString: '0 0 * * *',
          timezone: 'UTC',
          defaultPrompt: 'Run'
        }
      },
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

  it('should convert customVariable renderType and default to AI generation', () => {
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
            renderTypeList: [FlowNodeInputTypeEnum.customVariable],
            selectedType: FlowNodeInputTypeEnum.customVariable
          }
        ],
        outputs: []
      }
    ];
    const result = pluginData2FlowNodeIO({ nodes });
    const customVarInput = result.inputs.find((i) => i.key === 'customVar');
    expect(customVarInput?.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.reference,
      FlowNodeInputTypeEnum.input
    ]);
    expect(customVarInput?.selectedType).toBe(FlowNodeInputTypeEnum.agentGenerated);
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
  it('should recommend Agent generation for the workflow user question', () => {
    const result = appData2FlowNodeIO({});

    expect(
      result.inputs.find((input) => input.key === NodeInputKeyEnum.userChatInput)
    ).toMatchObject({
      required: true,
      defaultToAgentGenerated: true
    });
  });

  it('should keep forbid stream as a manual-only switch', () => {
    const result = appData2FlowNodeIO({});

    expect(
      result.inputs.find((input) => input.key === NodeInputKeyEnum.forbidStream)
    ).toMatchObject({
      renderTypeList: [FlowNodeInputTypeEnum.switch],
      canAgentGenerated: false,
      value: false
    });
  });

  it('should preserve workflow variable descriptions without adding a tool default mode', () => {
    const result = appData2FlowNodeIO({
      chatConfig: {
        variables: [
          {
            key: 'query',
            label: 'Query',
            type: VariableInputEnum.input,
            description: 'Search query'
          }
        ]
      }
    });

    const input = result.inputs.find((input) => input.key === 'query');
    expect(input).toMatchObject({ description: 'Search query' });
    expect(input).not.toHaveProperty('defaultToAgentGenerated');
  });

  it('should retain internal variable defaults while keeping the input hidden', () => {
    const result = appData2FlowNodeIO({
      chatConfig: {
        variables: [
          {
            key: 'internalToken',
            label: 'Internal token',
            type: VariableInputEnum.internal,
            valueType: WorkflowIOValueTypeEnum.string,
            description: 'Internal only',
            defaultValue: 'default-token'
          }
        ]
      }
    });

    expect(result.inputs.find((input) => input.key === 'internalToken')).toMatchObject({
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      defaultValue: 'default-token',
      value: 'default-token'
    });
  });

  it('should project external variables to configurable parent workflow inputs', () => {
    const result = appData2FlowNodeIO({
      chatConfig: {
        variables: [
          {
            key: 'externalToken',
            label: 'External token',
            type: VariableInputEnum.custom,
            valueType: WorkflowIOValueTypeEnum.string,
            description: 'Provided by the external variable provider',
            defaultValue: 'fallback-token'
          }
        ]
      }
    });

    expect(result.inputs.find((input) => input.key === 'externalToken')).toMatchObject({
      renderTypeList: [
        FlowNodeInputTypeEnum.agentGenerated,
        FlowNodeInputTypeEnum.reference,
        FlowNodeInputTypeEnum.input
      ],
      defaultValue: 'fallback-token',
      value: 'fallback-token'
    });
  });

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
    expect(fileLinkInput).toMatchObject({
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.JSONEditor],
      defaultToAgentGenerated: true
    });
    expect(fileLinkInput).not.toHaveProperty('selectedType');
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

  it.each([
    {
      title: 'video selection',
      fileSelectConfig: {
        canSelectFile: false,
        canSelectImg: false,
        canSelectVideo: true
      }
    },
    {
      title: 'audio selection',
      fileSelectConfig: {
        canSelectFile: false,
        canSelectImg: false,
        canSelectAudio: true
      }
    },
    {
      title: 'custom file extension selection',
      fileSelectConfig: {
        canSelectFile: false,
        canSelectImg: false,
        canSelectCustomFileExtension: true
      }
    }
  ])(
    'should include file link input when fileSelectConfig allows $title',
    ({ fileSelectConfig }) => {
      const result = appData2FlowNodeIO({
        chatConfig: {
          fileSelectConfig
        }
      });
      const fileLinkInput = result.inputs.find((i) => i.key === NodeInputKeyEnum.fileUrlList);
      expect(fileLinkInput).toBeDefined();
    }
  );

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
          { key: 'switchVar', label: 'Switch', type: VariableInputEnum.switch, description: '' },
          { key: 'fileVar', label: 'File', type: VariableInputEnum.file, description: '' }
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

    const fileVar = result.inputs.find((i) => i.key === 'fileVar');
    expect(fileVar?.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.fileSelect,
      FlowNodeInputTypeEnum.reference
    ]);
  });

  it('should not carry stale select options into text variables', () => {
    const result = appData2FlowNodeIO({
      chatConfig: {
        variables: [
          {
            key: 'textVar',
            label: 'Text',
            type: VariableInputEnum.input,
            description: '',
            valueType: WorkflowIOValueTypeEnum.string,
            list: [{ label: 'A', value: 'a' }]
          },
          {
            key: 'textareaVar',
            label: 'Textarea',
            type: VariableInputEnum.textarea,
            description: '',
            list: [{ label: 'B', value: 'b' }]
          },
          {
            key: 'selectVar',
            label: 'Select',
            type: VariableInputEnum.select,
            description: '',
            list: [{ label: 'C', value: 'c' }]
          }
        ]
      }
    });

    expect(result.inputs.find((input) => input.key === 'textVar')?.list).toBeUndefined();
    expect(result.inputs.find((input) => input.key === 'textareaVar')?.list).toBeUndefined();
    expect(result.inputs.find((input) => input.key === 'selectVar')?.list).toEqual([
      { label: 'c', value: 'c' }
    ]);
  });

  it('should map text input variable with non-string valueType to JSONEditor', () => {
    const result = appData2FlowNodeIO({
      chatConfig: {
        variables: [
          {
            key: 'objVar',
            label: 'Object',
            type: VariableInputEnum.input,
            description: '',
            valueType: WorkflowIOValueTypeEnum.object
          },
          {
            key: 'arrVar',
            label: 'Array',
            type: VariableInputEnum.input,
            description: '',
            valueType: WorkflowIOValueTypeEnum.arrayString
          },
          {
            key: 'strVar',
            label: 'String',
            type: VariableInputEnum.input,
            description: '',
            valueType: WorkflowIOValueTypeEnum.string
          }
        ]
      }
    });

    const objVar = result.inputs.find((i) => i.key === 'objVar');
    expect(objVar?.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.JSONEditor,
      FlowNodeInputTypeEnum.reference
    ]);

    const arrVar = result.inputs.find((i) => i.key === 'arrVar');
    expect(arrVar?.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.JSONEditor,
      FlowNodeInputTypeEnum.reference
    ]);

    const strVar = result.inputs.find((i) => i.key === 'strVar');
    expect(strVar?.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.input,
      FlowNodeInputTypeEnum.reference
    ]);
  });

  it('should snap legacy any valueType to string and keep undefined as text input', () => {
    const result = appData2FlowNodeIO({
      chatConfig: {
        variables: [
          {
            key: 'anyVar',
            label: 'Any',
            type: VariableInputEnum.input,
            description: '',
            valueType: WorkflowIOValueTypeEnum.any
          },
          {
            key: 'legacyVar',
            label: 'Legacy',
            type: VariableInputEnum.input,
            description: ''
          }
        ]
      }
    });

    const anyVar = result.inputs.find((i) => i.key === 'anyVar');
    expect(anyVar?.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.input,
      FlowNodeInputTypeEnum.reference
    ]);
    expect(anyVar?.valueType).toBe(WorkflowIOValueTypeEnum.string);

    const legacyVar = result.inputs.find((i) => i.key === 'legacyVar');
    expect(legacyVar?.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.input,
      FlowNodeInputTypeEnum.reference
    ]);
  });

  it('should preserve defaultValue on variable inputs', () => {
    const result = appData2FlowNodeIO({
      chatConfig: {
        variables: [
          {
            key: 'var1',
            label: 'Variable 1',
            type: VariableInputEnum.input,
            description: '',
            defaultValue: 'hello'
          },
          {
            key: 'numVar',
            label: 'Num',
            type: VariableInputEnum.numberInput,
            description: '',
            defaultValue: 42
          }
        ]
      }
    });
    const var1 = result.inputs.find((i) => i.key === 'var1');
    expect(var1?.defaultValue).toBe('hello');
    expect(var1?.value).toBe('hello');

    const numVar = result.inputs.find((i) => i.key === 'numVar');
    expect(numVar?.defaultValue).toBe(42);
    expect(numVar?.value).toBe(42);
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

describe('ifElse branch helpers', () => {
  it('should initialize new branches with random branch ids', () => {
    const result = initNewIfElseList([{ condition: 'AND', list: [] }]);

    expect(result[0].branchId).toMatch(/^[a-z][a-zA-Z0-9]{15}$/);
    expect(result[0].branchId).not.toBe(IfElseResultEnum.IF);
  });

  it('should return the canonical branch id', () => {
    expect(getIfElseBranchHandleKey({ branchId: 'stableId1', condition: 'AND', list: [] }, 1)).toBe(
      'stableId1'
    );
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

  it('should not serialize hidden plugin inputs', () => {
    const result = clientGetWorkflowToolRunUserQuery({
      pluginInputs: [
        {
          key: 'internal',
          defaultValue: 'internal default',
          renderTypeList: [FlowNodeInputTypeEnum.hidden]
        },
        {
          key: 'query',
          defaultValue: 'default query',
          renderTypeList: [FlowNodeInputTypeEnum.input]
        }
      ],
      variables: { internal: 'external value', query: 'hello' }
    });

    expect(JSON.stringify(result.value)).not.toContain('internal');
    expect(JSON.stringify(result.value)).toContain('query');
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
            selectedType: FlowNodeInputTypeEnum.selectLLMModel,
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
            selectedType: FlowNodeInputTypeEnum.selectLLMModel,
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

  it('should skip canonical reference type inputs', async () => {
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
            selectedType: FlowNodeInputTypeEnum.reference,
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
