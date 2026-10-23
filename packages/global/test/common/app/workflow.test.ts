import { describe, expect, it } from 'vitest';
import {
  pluginData2FlowNodeIO,
  appData2FlowNodeIO,
  toolData2FlowNodeIO,
  toolSetData2FlowNodeIO
} from '@fastgpt/global/common/app/workflow';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  VariableInputEnum,
  NodeOutputKeyEnum
} from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';

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

  it('should convert plugin inputs, prepend stream mode and disable editing', () => {
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
          },
          {
            key: 'input1',
            label: 'Input 1',
            valueType: WorkflowIOValueTypeEnum.string,
            renderTypeList: [FlowNodeInputTypeEnum.input],
            defaultValue: 'default input'
          }
        ],
        outputs: []
      }
    ];
    const result = pluginData2FlowNodeIO({ nodes });
    expect(result.inputs[0].key).toBe(NodeInputKeyEnum.forbidStream);
    expect(result.inputs.find((i) => i.key === 'customVar')).toMatchObject({
      renderTypeList: [
        FlowNodeInputTypeEnum.agentGenerated,
        FlowNodeInputTypeEnum.reference,
        FlowNodeInputTypeEnum.input
      ],
      selectedType: FlowNodeInputTypeEnum.agentGenerated,
      canEdit: false
    });
    expect(result.inputs.find((i) => i.key === 'input1')).toMatchObject({
      renderTypeList: [FlowNodeInputTypeEnum.input],
      defaultValue: 'default input',
      value: 'default input',
      canEdit: false
    });
  });
});

describe('appData2FlowNodeIO', () => {
  it('should return default workflow IO with an Agent question and manual-only stream switch', () => {
    const result = appData2FlowNodeIO({});

    expect(
      result.inputs.find((input) => input.key === NodeInputKeyEnum.userChatInput)
    ).toMatchObject({
      required: true,
      defaultToAgentGenerated: true
    });
    expect(
      result.inputs.find((input) => input.key === NodeInputKeyEnum.forbidStream)
    ).toMatchObject({
      renderTypeList: [FlowNodeInputTypeEnum.switch],
      canAgentGenerated: false,
      value: false
    });
    expect(result.outputs).toHaveLength(2);
    expect(result.outputs[0].key).toBe(NodeOutputKeyEnum.history);
    expect(result.outputs[1].key).toBe(NodeOutputKeyEnum.answerText);
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

  it.each([
    'canSelectFile',
    'canSelectImg',
    'canSelectVideo',
    'canSelectAudio',
    'canSelectCustomFileExtension'
  ] as const)('should include file link input when %s is enabled', (selectionKey) => {
    const result = appData2FlowNodeIO({
      chatConfig: {
        fileSelectConfig: {
          canSelectFile: false,
          canSelectImg: false,
          canSelectVideo: false,
          canSelectAudio: false,
          canSelectCustomFileExtension: false,
          [selectionKey]: true
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

  it('should not include file link input when fileSelectConfig disables all selection', () => {
    const result = appData2FlowNodeIO({
      chatConfig: {
        fileSelectConfig: {
          canSelectFile: false,
          canSelectImg: false,
          canSelectVideo: false,
          canSelectAudio: false,
          canSelectCustomFileExtension: false
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
  it.each(['mcpToolSet', 'httpToolSet'] as const)(
    'uses the App id for an empty legacy %s id and preserves explicit ids',
    (key) => {
      const node = {
        nodeId: 'set',
        name: 'Legacy',
        flowNodeType: FlowNodeTypeEnum.toolSet,
        inputs: [],
        outputs: [],
        toolConfig: { [key]: { toolId: '', url: 'https://example.com', toolList: [] } }
      };
      const original = structuredClone(node);
      const preview = toolSetData2FlowNodeIO({ nodes: [node] as any, toolSetId: 'actual-app-id' });
      expect(preview.toolConfig?.[key]).toEqual({ toolId: 'actual-app-id', toolList: [] });
      expect(node).toEqual(original);
      node.toolConfig[key].toolId = 'explicit-app-id';
      expect(
        toolSetData2FlowNodeIO({ nodes: [node] as any, toolSetId: 'actual-app-id' }).toolConfig?.[
          key
        ]
      ).toEqual({ toolId: 'explicit-app-id', toolList: [] });
    }
  );

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
    const result = toolSetData2FlowNodeIO({ nodes, toolSetId: 'test' });
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
    const result = toolSetData2FlowNodeIO({ nodes, toolSetId: 'test' });
    expect(result.inputs).toEqual(toolSetInputs);
    expect(result.showSourceHandle).toBe(false);
    expect(result.showTargetHandle).toBe(false);
  });
});
