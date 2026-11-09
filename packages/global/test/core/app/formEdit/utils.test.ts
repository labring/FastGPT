import { AgentToolInputModeEnum } from '@fastgpt/global/core/app/tool/constants';
import { PluginStatusEnum } from '@fastgpt/global/core/plugin/type';
import { describe, expect, it } from 'vitest';
import {
  validateToolConfiguration,
  canInputBeAgentGenerated,
  canInputBeConfiguredAsToolParam,
  canInputBeManuallyConfigured,
  checkNeedsUserConfiguration,
  filterAgentGeneratedToolParams,
  filterToolConfiguredParams,
  formatJsonEditorValue,
  getToolInputDisplayRenderTypeList,
  getToolInputManualRenderType,
  getToolConfigStatus,
  getAgentToolRuntimeStatus,
  initAgentToolInputType,
  initToolInputTypeByDefaultMode,
  isAgentGeneratedToolInput,
  isToolInputValueConfigured,
  migrateToolInputConfig,
  normalizeFlowNodeInputType,
  parseJsonEditorValue,
  serializeAgentTool,
  stripToolInputDefaultMode
} from '@fastgpt/global/core/app/formEdit/utils';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { AgentNode } from '@fastgpt/global/core/workflow/template/system/agent';
import {
  NodeInputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { FlowNodeTemplateType } from '@fastgpt/global/core/workflow/type/node';

// Helper to create mock input item
const createMockInput = (
  overrides: Partial<FlowNodeInputItemType> = {}
): FlowNodeInputItemType => ({
  key: 'testKey',
  label: 'Test Label',
  renderTypeList: [FlowNodeInputTypeEnum.input],
  ...overrides
});

// Helper to create mock tool template
const createMockToolTemplate = (inputs: FlowNodeInputItemType[] = []): FlowNodeTemplateType =>
  ({
    id: 'test-tool',
    name: 'Test Tool',
    flowNodeType: 'tool',
    templateType: 'test',
    inputs,
    outputs: []
  }) as unknown as FlowNodeTemplateType;

describe('parseJsonEditorValue', () => {
  it.each([
    ['[1,2,3]', [1, 2, 3]],
    ['{"":""}', { '': '' }],
    ['"text"', 'text'],
    ['true', true],
    ['null', null]
  ])('parses %s into its native JSON value', (text, expected) => {
    expect(parseJsonEditorValue(text)).toEqual({ success: true, value: expected });
  });

  it('keeps non-string values unchanged', () => {
    const value = [1, 2, 3];

    expect(parseJsonEditorValue(value)).toEqual({ success: true, value });
  });

  it('reports incomplete JSON without throwing', () => {
    expect(parseJsonEditorValue('[1,2')).toEqual({
      success: false,
      value: '[1,2'
    });
  });
});

describe('formatJsonEditorValue', () => {
  it.each([
    [{ enabled: true }, '{\n  "enabled": true\n}'],
    [[1, 2], '[\n  1,\n  2\n]'],
    [null, 'null'],
    [undefined, ''],
    ['{"legacy":true}', '{"legacy":true}'],
    ['"text"', '"text"']
  ])('formats JSON editor value %#', (value, expected) => {
    expect(formatJsonEditorValue(value)).toBe(expected);
  });
});

describe('normalizeFlowNodeInputType 知识库选择', () => {
  it('保留仍支持的引用模式及其引用数组', () => {
    const value = [['source-node', 'datasets']];
    const input = normalizeFlowNodeInputType(
      createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.selectDataset, FlowNodeInputTypeEnum.reference],
        selectedType: FlowNodeInputTypeEnum.reference,
        value
      })
    );

    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.reference);
    expect(input.value).toBe(value);
  });

  it('未显式配置手动选择值时保留 defaultValue 的回退语义', () => {
    const defaultValue = [{ datasetId: 'default-dataset' }];
    const input = normalizeFlowNodeInputType(
      createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.selectDataset],
        defaultValue
      })
    );

    expect(input.value).toBeUndefined();
    expect(input.defaultValue).toBe(defaultValue);
  });
});

describe('validateToolConfiguration', () => {
  describe('valid configurations', () => {
    it('should return true for empty inputs', () => {
      const toolTemplate = createMockToolTemplate([]);
      const result = validateToolConfiguration({ toolTemplate, isAppTool: true });
      expect(result).toBe(true);
    });

    it('should return true for basic input types', () => {
      const toolTemplate = createMockToolTemplate([
        createMockInput({ renderTypeList: [FlowNodeInputTypeEnum.input] }),
        createMockInput({ renderTypeList: [FlowNodeInputTypeEnum.textarea] })
      ]);
      const result = validateToolConfiguration({ toolTemplate });
      expect(result).toBe(true);
    });

    it('should return true for reference type with toolDescription', () => {
      const toolTemplate = createMockToolTemplate([
        createMockInput({
          renderTypeList: [FlowNodeInputTypeEnum.reference],
          toolDescription: 'This is a tool description'
        })
      ]);
      const result = validateToolConfiguration({ toolTemplate });
      expect(result).toBe(true);
    });

    it('should return true for multiple render types including reference with toolDescription', () => {
      const toolTemplate = createMockToolTemplate([
        createMockInput({
          renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.input],
          toolDescription: 'Tool description'
        })
      ]);
      const result = validateToolConfiguration({ toolTemplate });
      expect(result).toBe(true);
    });
  });

  describe('invalid configurations', () => {
    it('should return false for reference type without toolDescription', () => {
      const toolTemplate = createMockToolTemplate([
        createMockInput({
          renderTypeList: [FlowNodeInputTypeEnum.reference]
        })
      ]);
      const result = validateToolConfiguration({ toolTemplate });
      expect(result).toBe(false);
    });

    it.each([
      FlowNodeInputTypeEnum.fileSelect,
      FlowNodeInputTypeEnum.selectDataset,
      FlowNodeInputTypeEnum.selectDatasetParamsModal,
      FlowNodeInputTypeEnum.settingDatasetQuotePrompt,
      FlowNodeInputTypeEnum.addInputParam,
      FlowNodeInputTypeEnum.selectLLMModel,
      FlowNodeInputTypeEnum.settingLLMModel,
      FlowNodeInputTypeEnum.customVariable
    ])('should return false for unsupported input type %s', (renderType) => {
      const toolTemplate = createMockToolTemplate([
        createMockInput({ renderTypeList: [renderType] })
      ]);

      expect(
        validateToolConfiguration({ toolTemplate, canUploadFile: true, isAppTool: true })
      ).toBe(false);
    });

    it('should return false when an agent-generated input uses a special render type', () => {
      const toolTemplate = createMockToolTemplate([
        createMockInput({
          renderTypeList: [
            FlowNodeInputTypeEnum.agentGenerated,
            FlowNodeInputTypeEnum.selectDatasetParamsModal
          ]
        })
      ]);

      expect(validateToolConfiguration({ toolTemplate, isAppTool: true })).toBe(false);
    });

    it('should allow workflow apps with hidden or unsupported inputs to use their defaults', () => {
      const toolTemplate = createMockToolTemplate([
        createMockInput({
          key: 'internalValue',
          renderTypeList: [FlowNodeInputTypeEnum.hidden],
          defaultValue: 'internal-default'
        }),
        createMockInput({
          key: 'dataset',
          renderTypeList: [FlowNodeInputTypeEnum.selectDataset],
          defaultValue: []
        })
      ]);
      toolTemplate.flowNodeType = FlowNodeTypeEnum.appModule;

      expect(validateToolConfiguration({ toolTemplate })).toBe(true);
    });

    it('should reject special inputs for Agent tools even when the workflow app can use defaults', () => {
      const toolTemplate = createMockToolTemplate([
        createMockInput({
          key: 'dataset',
          renderTypeList: [FlowNodeInputTypeEnum.selectDataset],
          defaultValue: []
        })
      ]);
      toolTemplate.flowNodeType = FlowNodeTypeEnum.appModule;

      expect(validateToolConfiguration({ toolTemplate, isAppTool: true })).toBe(false);
    });

    it('should allow projected external variables with supported manual inputs for Agent tools', () => {
      const toolTemplate = createMockToolTemplate([
        createMockInput({
          renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.input]
        })
      ]);

      expect(validateToolConfiguration({ toolTemplate, isAppTool: true })).toBe(true);
    });

    it('should allow special inputs in workflow tool nodes', () => {
      const toolTemplate = createMockToolTemplate([
        createMockInput({ renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel] }),
        createMockInput({ renderTypeList: [FlowNodeInputTypeEnum.selectDataset] }),
        createMockInput({ renderTypeList: [FlowNodeInputTypeEnum.fileSelect] })
      ]);

      expect(validateToolConfiguration({ toolTemplate })).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should return false when any input is invalid among multiple inputs', () => {
      const toolTemplate = createMockToolTemplate([
        createMockInput({ renderTypeList: [FlowNodeInputTypeEnum.input] }),
        createMockInput({ renderTypeList: [FlowNodeInputTypeEnum.selectDataset] }),
        createMockInput({ renderTypeList: [FlowNodeInputTypeEnum.textarea] })
      ]);
      const result = validateToolConfiguration({ toolTemplate, isAppTool: true });
      expect(result).toBe(false);
    });

    it('should handle empty renderTypeList', () => {
      const toolTemplate = createMockToolTemplate([createMockInput({ renderTypeList: [] })]);
      const result = validateToolConfiguration({ toolTemplate });
      expect(result).toBe(true);
    });
  });
});

describe('checkNeedsUserConfiguration', () => {
  describe('when no configuration is needed', () => {
    it('should return false for empty inputs', () => {
      const tool = { inputs: [] };
      const result = checkNeedsUserConfiguration(tool);
      expect(result).toBe(false);
    });

    it('should return false when all inputs are agent generated', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.agentGenerated, FlowNodeInputTypeEnum.input],
            selectedType: FlowNodeInputTypeEnum.agentGenerated,
            toolDescription: 'Tool description'
          })
        ]
      };
      const result = checkNeedsUserConfiguration(tool);
      expect(result).toBe(false);
    });

    it.each([
      { key: NodeInputKeyEnum.forbidStream, renderTypeList: [FlowNodeInputTypeEnum.switch] },
      { key: NodeInputKeyEnum.history, renderTypeList: [FlowNodeInputTypeEnum.input] },
      { renderTypeList: [FlowNodeInputTypeEnum.reference] },
      { renderTypeList: [FlowNodeInputTypeEnum.hidden] }
    ])('should return false for excluded or non-form input %j', (overrides) => {
      expect(checkNeedsUserConfiguration({ inputs: [createMockInput(overrides)] })).toBe(false);
    });

    it('should tolerate legacy inputs without renderTypeList', () => {
      const tool = {
        inputs: [
          {
            ...createMockInput(),
            renderTypeList: undefined
          }
        ]
      } as unknown as { inputs: FlowNodeInputItemType[] };

      expect(checkNeedsUserConfiguration(tool)).toBe(false);
    });
  });

  describe('when configuration is needed', () => {
    it('should return true for systemInputConfig key', () => {
      const tool = {
        inputs: [
          createMockInput({
            key: NodeInputKeyEnum.systemInputConfig,
            renderTypeList: [FlowNodeInputTypeEnum.custom]
          })
        ]
      };
      expect(checkNeedsUserConfiguration(tool)).toBe(true);
    });

    it.each([
      FlowNodeInputTypeEnum.input,
      FlowNodeInputTypeEnum.textarea,
      FlowNodeInputTypeEnum.numberInput,
      FlowNodeInputTypeEnum.password,
      FlowNodeInputTypeEnum.switch,
      FlowNodeInputTypeEnum.select,
      FlowNodeInputTypeEnum.multipleSelect,
      FlowNodeInputTypeEnum.JSONEditor,
      FlowNodeInputTypeEnum.timePointSelect,
      FlowNodeInputTypeEnum.timeRangeSelect
    ])('should return true for %s render type without toolDescription', (renderType) => {
      expect(
        checkNeedsUserConfiguration({
          inputs: [createMockInput({ renderTypeList: [renderType] })]
        })
      ).toBe(true);
    });
  });

  describe('mixed inputs', () => {
    it('should return true if any input needs configuration', () => {
      const tool = {
        inputs: [
          createMockInput({
            key: 'input1',
            renderTypeList: [FlowNodeInputTypeEnum.reference],
            toolDescription: 'Has description'
          }),
          createMockInput({
            key: 'input2',
            renderTypeList: [FlowNodeInputTypeEnum.input]
          })
        ]
      };
      const result = checkNeedsUserConfiguration(tool);
      expect(result).toBe(true);
    });

    it('should return true when a developer-configured input keeps toolDescription', () => {
      const tool = {
        inputs: [
          createMockInput({
            key: NodeInputKeyEnum.forbidStream,
            renderTypeList: [FlowNodeInputTypeEnum.switch]
          }),
          createMockInput({
            key: NodeInputKeyEnum.history,
            renderTypeList: [FlowNodeInputTypeEnum.input]
          }),
          createMockInput({
            key: 'input3',
            renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
            toolDescription: 'Has description'
          })
        ]
      };
      const result = checkNeedsUserConfiguration(tool);
      expect(result).toBe(true);
    });

    it('should return false if all inputs are excluded or agent generated', () => {
      const tool = {
        inputs: [
          createMockInput({
            key: NodeInputKeyEnum.forbidStream,
            renderTypeList: [FlowNodeInputTypeEnum.switch]
          }),
          createMockInput({
            key: NodeInputKeyEnum.history,
            renderTypeList: [FlowNodeInputTypeEnum.input]
          }),
          createMockInput({
            key: 'input3',
            renderTypeList: [FlowNodeInputTypeEnum.agentGenerated, FlowNodeInputTypeEnum.input],
            selectedType: FlowNodeInputTypeEnum.agentGenerated,
            toolDescription: 'Has description'
          })
        ]
      };
      const result = checkNeedsUserConfiguration(tool);
      expect(result).toBe(false);
    });
  });
});

describe('isToolInputValueConfigured', () => {
  it('checks the selected mode when password inputs also support references', () => {
    const input = createMockInput({
      renderTypeList: [FlowNodeInputTypeEnum.password, FlowNodeInputTypeEnum.reference],
      selectedType: FlowNodeInputTypeEnum.reference,
      value: [VARIABLE_NODE_ID, 'token']
    });
    expect(isToolInputValueConfigured({ input })).toBe(true);
    expect(
      isToolInputValueConfigured({
        input: { ...input, selectedType: FlowNodeInputTypeEnum.password }
      })
    ).toBe(false);
    expect(isToolInputValueConfigured({ input: { ...input, value: [] } })).toBe(false);
    expect(
      isToolInputValueConfigured({
        input: { ...input, value: undefined, defaultValue: input.value }
      })
    ).toBe(true);
  });
});

describe('getToolConfigStatus', () => {
  it.each([
    [{ value: 'plain' }, 'configured'],
    [{ secret: 'cipher' }, 'configured'],
    ['legacy-plain', 'configured'],
    [{ value: '' }, 'waitingForConfig'],
    [{ value: 'plain', extra: true }, 'waitingForConfig'],
    [{ ref: [] }, 'waitingForConfig']
  ])('uses shared credential validity for password configuration: %j', (value, status) => {
    const tool = {
      inputs: [
        createMockInput({
          renderTypeList: [FlowNodeInputTypeEnum.password],
          required: true,
          value
        })
      ]
    };
    expect(getToolConfigStatus({ tool }).status).toBe(status);
  });

  describe('noConfig status', () => {
    it('should return noConfig for empty inputs', () => {
      const tool = { inputs: [] };
      const result = getToolConfigStatus({ tool });
      expect(result).toEqual({
        needConfig: false,
        status: 'noConfig'
      });
    });

    it('should return noConfig when all inputs are agent generated', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.agentGenerated, FlowNodeInputTypeEnum.input],
            selectedType: FlowNodeInputTypeEnum.agentGenerated,
            toolDescription: 'Tool description'
          })
        ]
      };
      const result = getToolConfigStatus({ tool });
      expect(result).toEqual({
        needConfig: false,
        status: 'noConfig'
      });
    });

    it('should return noConfig for excluded input keys', () => {
      const tool = {
        inputs: [
          createMockInput({
            key: NodeInputKeyEnum.forbidStream,
            renderTypeList: [FlowNodeInputTypeEnum.switch]
          }),
          createMockInput({
            key: NodeInputKeyEnum.history,
            renderTypeList: [FlowNodeInputTypeEnum.input]
          })
        ]
      };
      const result = getToolConfigStatus({ tool });
      expect(result).toEqual({
        needConfig: false,
        status: 'noConfig'
      });
    });

    it('should ignore required inputs that cannot be configured by a parent tool', () => {
      const result = getToolConfigStatus({
        tool: {
          inputs: [
            createMockInput({
              key: 'internalValue',
              renderTypeList: [FlowNodeInputTypeEnum.hidden],
              required: true,
              defaultValue: 'internal-default'
            }),
            createMockInput({
              key: 'dataset',
              renderTypeList: [FlowNodeInputTypeEnum.selectDataset],
              required: true,
              defaultValue: []
            })
          ]
        }
      });

      expect(result).toEqual({
        needConfig: false,
        status: 'noConfig'
      });
    });
  });

  describe('configured status', () => {
    it.each([
      { renderTypeList: [FlowNodeInputTypeEnum.input], value: 'some value' },
      {
        renderTypeList: [FlowNodeInputTypeEnum.input],
        value: undefined,
        defaultValue: 'default value'
      },
      { renderTypeList: [FlowNodeInputTypeEnum.multipleSelect], value: ['option1', 'option2'] },
      { renderTypeList: [FlowNodeInputTypeEnum.JSONEditor], value: { key: 'value' } },
      { renderTypeList: [FlowNodeInputTypeEnum.switch], value: false },
      { renderTypeList: [FlowNodeInputTypeEnum.numberInput], value: 0 }
    ])('should return configured for valid required input %j', (overrides) => {
      const tool = {
        inputs: [createMockInput({ required: true, ...overrides })]
      };
      expect(getToolConfigStatus({ tool })).toEqual({
        needConfig: false,
        status: 'configured'
      });
    });

    it('should return configured when all required inputs have values and optional inputs are empty', () => {
      const tool = {
        inputs: [
          createMockInput({
            key: 'input1',
            renderTypeList: [FlowNodeInputTypeEnum.input],
            required: true,
            value: 'value1'
          }),
          createMockInput({
            key: 'input2',
            renderTypeList: [FlowNodeInputTypeEnum.numberInput],
            required: true,
            value: 123
          }),
          createMockInput({
            key: 'optional',
            renderTypeList: [FlowNodeInputTypeEnum.input],
            required: false,
            value: ''
          })
        ]
      };
      expect(getToolConfigStatus({ tool })).toEqual({
        needConfig: false,
        status: 'configured'
      });
    });
  });

  describe('waitingForConfig status', () => {
    it.each([
      { renderTypeList: [FlowNodeInputTypeEnum.input], value: undefined },
      { renderTypeList: [FlowNodeInputTypeEnum.input], value: null },
      { renderTypeList: [FlowNodeInputTypeEnum.input], value: '' },
      { renderTypeList: [FlowNodeInputTypeEnum.multipleSelect], value: [] },
      {
        renderTypeList: [FlowNodeInputTypeEnum.timeRangeSelect],
        value: ['2026-07-07T00:00:00+08:00', undefined]
      },
      { renderTypeList: [FlowNodeInputTypeEnum.JSONEditor], value: {} },
      {
        key: NodeInputKeyEnum.systemInputConfig,
        renderTypeList: [FlowNodeInputTypeEnum.custom],
        required: false,
        value: undefined
      },
      {
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
        toolDescription: 'Legacy description',
        value: ''
      },
      {
        renderTypeList: [FlowNodeInputTypeEnum.agentGenerated, FlowNodeInputTypeEnum.password],
        toolDescription: 'API key',
        value: ''
      }
    ])('should return waitingForConfig for incomplete input %j', (overrides) => {
      const tool = {
        inputs: [createMockInput({ required: true, ...overrides })]
      };
      expect(getToolConfigStatus({ tool })).toEqual({
        needConfig: true,
        status: 'waitingForConfig'
      });
    });

    it('should return waitingForConfig when any required input is missing value', () => {
      const tool = {
        inputs: [
          createMockInput({
            key: 'input1',
            renderTypeList: [FlowNodeInputTypeEnum.input],
            required: true,
            value: 'filled'
          }),
          createMockInput({
            key: 'input2',
            renderTypeList: [FlowNodeInputTypeEnum.input],
            required: true,
            value: ''
          })
        ]
      };
      expect(getToolConfigStatus({ tool })).toEqual({
        needConfig: true,
        status: 'waitingForConfig'
      });
    });
  });
});

describe('agent generated tool input helpers', () => {
  it('restores legacy default modes when saved mode is absent', () => {
    const input = createMockInput({
      renderTypeList: [FlowNodeInputTypeEnum.input],
      toolDescription: 'Legacy parameter'
    });

    expect(
      initAgentToolInputType({ input, legacyDefaultMode: 'allAgentGenerated' }).selectedType
    ).toBe(FlowNodeInputTypeEnum.agentGenerated);
    expect(
      initAgentToolInputType({ input, legacyDefaultMode: 'toolDescription' }).selectedType
    ).toBe(FlowNodeInputTypeEnum.agentGenerated);
    expect(
      initAgentToolInputType({
        input: { ...input, toolDescription: undefined },
        legacyDefaultMode: 'toolDescription'
      }).selectedType
    ).toBe(FlowNodeInputTypeEnum.input);
  });

  it.each([
    FlowNodeInputTypeEnum.hidden,
    FlowNodeInputTypeEnum.selectDataset,
    FlowNodeInputTypeEnum.selectLLMModel,
    FlowNodeInputTypeEnum.customVariable,
    FlowNodeInputTypeEnum.datasetTagFilter
  ])('should hide unsupported parent tool configuration type %s', (renderType) => {
    expect(canInputBeConfiguredAsToolParam(createMockInput({ renderTypeList: [renderType] }))).toBe(
      false
    );
  });

  it('should retain the canonical selectedType when normalizing an input', () => {
    const input = normalizeFlowNodeInputType(
      createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.numberInput],
        selectedType: FlowNodeInputTypeEnum.numberInput
      })
    );

    expect(input.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.reference,
      FlowNodeInputTypeEnum.numberInput
    ]);
    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.numberInput);
  });

  it('should add agentGenerated to supported tool inputs and apply defaultToAgentGenerated', () => {
    const input = normalizeFlowNodeInputType(
      createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.numberInput, FlowNodeInputTypeEnum.reference],
        defaultToAgentGenerated: true
      }),
      { isTool: true }
    );

    expect(input.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.numberInput,
      FlowNodeInputTypeEnum.reference
    ]);
    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.agentGenerated);
  });

  it('should preserve an explicit manual selectedType in tool context', () => {
    const input = normalizeFlowNodeInputType(
      createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
        selectedType: FlowNodeInputTypeEnum.input,
        defaultToAgentGenerated: true
      }),
      { isTool: true }
    );

    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.input);
  });

  it('should remove agentGenerated from unsupported input types', () => {
    const input = normalizeFlowNodeInputType(
      createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.agentGenerated, FlowNodeInputTypeEnum.password],
        selectedType: FlowNodeInputTypeEnum.agentGenerated,
        defaultToAgentGenerated: true
      }),
      { isTool: true }
    );

    expect(input.renderTypeList).toEqual([FlowNodeInputTypeEnum.password]);
    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.password);
  });

  it('should allow user chat input to be agent generated', () => {
    expect(
      canInputBeAgentGenerated(
        createMockInput({
          key: NodeInputKeyEnum.userChatInput,
          renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea]
        })
      )
    ).toBe(true);
  });

  it('should respect an explicit AI generation denial', () => {
    expect(
      canInputBeAgentGenerated(
        createMockInput({
          canAgentGenerated: false,
          renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference]
        })
      )
    ).toBe(false);
  });

  it('should apply the projected external variable AI default when creating a tool node', () => {
    const input = initToolInputTypeByDefaultMode(
      createMockInput({
        renderTypeList: [
          FlowNodeInputTypeEnum.agentGenerated,
          FlowNodeInputTypeEnum.reference,
          FlowNodeInputTypeEnum.input
        ],
        selectedType: FlowNodeInputTypeEnum.agentGenerated,
        defaultToAgentGenerated: true
      }),
      { forceDefaultMode: true }
    );

    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.agentGenerated);
  });

  it('should never allow the forbid stream input to be agent generated', () => {
    expect(
      canInputBeAgentGenerated(
        createMockInput({
          key: NodeInputKeyEnum.forbidStream,
          renderTypeList: [FlowNodeInputTypeEnum.switch]
        })
      )
    ).toBe(false);
  });

  it('should identify reference-only inputs as agent-only configuration', () => {
    const input = createMockInput({
      renderTypeList: [FlowNodeInputTypeEnum.reference]
    });

    expect(canInputBeManuallyConfigured(input)).toBe(false);
    expect(getToolInputManualRenderType(input)).toBeUndefined();
  });

  it('should preserve an explicit reference-only selection in tool context', () => {
    const input = normalizeFlowNodeInputType(
      createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.reference],
        selectedType: FlowNodeInputTypeEnum.reference
      }),
      { isTool: true }
    );

    expect(input.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.reference
    ]);
    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.reference);
  });

  it('should normalize reference-only inputs to agent generated mode', () => {
    const input = initToolInputTypeByDefaultMode(
      createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.reference],
        selectedType: FlowNodeInputTypeEnum.reference
      }),
      { isTool: true }
    );

    expect(input.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.reference
    ]);
    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.agentGenerated);
    expect(isAgentGeneratedToolInput(input)).toBe(true);
  });

  it('should initialize defaultToAgentGenerated input as agent generated by default', () => {
    const input = initToolInputTypeByDefaultMode(
      createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
        defaultToAgentGenerated: true
      })
    );

    expect(input.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.input,
      FlowNodeInputTypeEnum.reference
    ]);
    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.agentGenerated);
    expect(isAgentGeneratedToolInput(input)).toBe(true);
  });

  it('should force the default mode over an explicit current selection', () => {
    const input = initToolInputTypeByDefaultMode(
      createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
        selectedType: FlowNodeInputTypeEnum.input,
        defaultToAgentGenerated: true
      }),
      { forceDefaultMode: true }
    );

    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.agentGenerated);
    expect(isAgentGeneratedToolInput(input)).toBe(true);
  });

  it('should remove defaultToAgentGenerated from a persisted tool input', () => {
    const input = createMockInput({ defaultToAgentGenerated: true });
    const persistedInput = stripToolInputDefaultMode(input);

    expect(persistedInput).not.toHaveProperty('defaultToAgentGenerated');
    expect(input.defaultToAgentGenerated).toBe(true);
  });

  it.each([undefined, false])(
    'should keep developer-configured input when defaultToAgentGenerated is %s',
    (defaultToAgentGenerated) => {
      const input = initToolInputTypeByDefaultMode(
        createMockInput({
          renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
          defaultToAgentGenerated
        })
      );

      expect(input.renderTypeList).toEqual([
        FlowNodeInputTypeEnum.agentGenerated,
        FlowNodeInputTypeEnum.input,
        FlowNodeInputTypeEnum.reference
      ]);
      expect(isAgentGeneratedToolInput(input)).toBe(false);
    }
  );

  it('should keep built-in user chat input manual outside a tool context', () => {
    const input = initToolInputTypeByDefaultMode(
      createMockInput({
        key: NodeInputKeyEnum.userChatInput,
        renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
        defaultToAgentGenerated: true
      })
    );

    expect(input.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.reference,
      FlowNodeInputTypeEnum.textarea
    ]);
    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.reference);
    expect(isAgentGeneratedToolInput(input)).toBe(false);
  });

  it('should initialize built-in user chat input as agent generated in a tool context', () => {
    const input = initToolInputTypeByDefaultMode(
      createMockInput({
        key: NodeInputKeyEnum.userChatInput,
        renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
        defaultToAgentGenerated: true
      }),
      { allowUserChatInputAgentGenerated: true }
    );

    expect(input.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.reference,
      FlowNodeInputTypeEnum.textarea
    ]);
    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.agentGenerated);
    expect(isAgentGeneratedToolInput(input)).toBe(true);
  });

  it('should keep explicit false defaultToAgentGenerated for user chat input', () => {
    const input = initToolInputTypeByDefaultMode(
      createMockInput({
        key: NodeInputKeyEnum.userChatInput,
        renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
        defaultToAgentGenerated: false
      }),
      { allowUserChatInputAgentGenerated: true }
    );

    expect(input.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.reference,
      FlowNodeInputTypeEnum.textarea
    ]);
    expect(isAgentGeneratedToolInput(input)).toBe(false);
  });

  it('should reset agent generation for user chat input when the current context disables it', () => {
    const input = initToolInputTypeByDefaultMode(
      createMockInput({
        key: NodeInputKeyEnum.userChatInput,
        renderTypeList: [
          FlowNodeInputTypeEnum.agentGenerated,
          FlowNodeInputTypeEnum.reference,
          FlowNodeInputTypeEnum.textarea
        ],
        selectedType: FlowNodeInputTypeEnum.agentGenerated
      }),
      { allowUserChatInputAgentGenerated: false }
    );

    expect(input.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.reference,
      FlowNodeInputTypeEnum.textarea
    ]);
    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.reference);
    expect(isAgentGeneratedToolInput(input)).toBe(false);
  });

  it('should materialize selectedType for inputs without a final type selection', () => {
    const input = initToolInputTypeByDefaultMode(
      createMockInput({
        key: NodeInputKeyEnum.systemInputConfig,
        renderTypeList: [FlowNodeInputTypeEnum.hidden]
      })
    );

    expect(input).toEqual(
      createMockInput({
        key: NodeInputKeyEnum.systemInputConfig,
        renderTypeList: [FlowNodeInputTypeEnum.hidden],
        selectedType: FlowNodeInputTypeEnum.hidden
      })
    );
  });

  it('should keep the persisted manual selection over the declared order', () => {
    const manualType = getToolInputManualRenderType(
      createMockInput({
        renderTypeList: [
          FlowNodeInputTypeEnum.agentGenerated,
          FlowNodeInputTypeEnum.input,
          FlowNodeInputTypeEnum.select,
          FlowNodeInputTypeEnum.reference
        ],
        selectedType: FlowNodeInputTypeEnum.select
      })
    );

    expect(manualType).toBe(FlowNodeInputTypeEnum.select);
  });

  it('should fall back to the first declared manual control', () => {
    // JSON Schema 投影把主控件放在第一位，例如带候选值的数组参数。
    const manualType = getToolInputManualRenderType(
      createMockInput({
        renderTypeList: [
          FlowNodeInputTypeEnum.agentGenerated,
          FlowNodeInputTypeEnum.JSONEditor,
          FlowNodeInputTypeEnum.multipleSelect,
          FlowNodeInputTypeEnum.reference
        ],
        selectedType: FlowNodeInputTypeEnum.agentGenerated
      })
    );

    expect(manualType).toBe(FlowNodeInputTypeEnum.JSONEditor);
  });

  it('should preserve textarea when it is the only manual candidate', () => {
    const manualType = getToolInputManualRenderType(
      createMockInput({
        renderTypeList: [
          FlowNodeInputTypeEnum.agentGenerated,
          FlowNodeInputTypeEnum.reference,
          FlowNodeInputTypeEnum.textarea
        ],
        selectedType: FlowNodeInputTypeEnum.agentGenerated
      })
    );

    expect(manualType).toBe(FlowNodeInputTypeEnum.textarea);
  });

  it('should not project a JSON editor onto nodes that only declare a text control', () => {
    const textareaOnlyInput = createMockInput({
      key: NodeInputKeyEnum.datasetSearchInput,
      valueType: WorkflowIOValueTypeEnum.arrayString,
      renderTypeList: [
        FlowNodeInputTypeEnum.agentGenerated,
        FlowNodeInputTypeEnum.reference,
        FlowNodeInputTypeEnum.textarea
      ],
      selectedType: FlowNodeInputTypeEnum.agentGenerated
    });

    expect(getToolInputManualRenderType(textareaOnlyInput)).toBe(FlowNodeInputTypeEnum.textarea);
    expect(
      getToolInputDisplayRenderTypeList({ input: textareaOnlyInput, showAgentGenerated: true })
    ).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.textarea,
      FlowNodeInputTypeEnum.reference
    ]);

    // 只声明单行 input 时退回 input，不要升级成多行控件。
    expect(
      getToolInputManualRenderType(
        createMockInput({
          valueType: WorkflowIOValueTypeEnum.arrayString,
          renderTypeList: [FlowNodeInputTypeEnum.input]
        })
      )
    ).toBe(FlowNodeInputTypeEnum.input);
  });

  it('should collapse duplicate manual input options to the first declared control', () => {
    const renderTypeList = getToolInputDisplayRenderTypeList({
      input: createMockInput({
        renderTypeList: [
          FlowNodeInputTypeEnum.reference,
          FlowNodeInputTypeEnum.agentGenerated,
          FlowNodeInputTypeEnum.textarea,
          FlowNodeInputTypeEnum.JSONEditor
        ]
      }),
      showAgentGenerated: true
    });

    expect(renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.textarea,
      FlowNodeInputTypeEnum.reference
    ]);
  });

  it('should keep reference available for reference-only workflow tool inputs', () => {
    const renderTypeList = getToolInputDisplayRenderTypeList({
      input: createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.agentGenerated, FlowNodeInputTypeEnum.reference]
      }),
      showAgentGenerated: true
    });

    expect(renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.reference
    ]);
  });

  it('should preserve an explicit selected reference type for user chat input', () => {
    const input = initToolInputTypeByDefaultMode(
      createMockInput({
        key: NodeInputKeyEnum.userChatInput,
        renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
        selectedType: FlowNodeInputTypeEnum.reference,
        required: true
      }),
      { allowUserChatInputAgentGenerated: true }
    );

    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.reference);
    expect(isAgentGeneratedToolInput(input)).toBe(false);
  });

  it('should filter model params by final agent generated selection', () => {
    const params = filterAgentGeneratedToolParams({
      params: {
        query: 'model query',
        indexOnly: 'model index value',
        manualText: 'model text',
        password: 'model secret',
        schemaOnly: 'schema value',
        [NodeInputKeyEnum.systemInputConfig]: 'model system config'
      },
      inputs: [
        createMockInput({
          key: 'query',
          renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
          selectedType: FlowNodeInputTypeEnum.agentGenerated
        }),
        createMockInput({
          key: 'indexOnly',
          renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
          selectedType: FlowNodeInputTypeEnum.agentGenerated
        }),
        createMockInput({
          key: 'manualText',
          renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
          selectedType: FlowNodeInputTypeEnum.input
        }),
        createMockInput({
          key: 'password',
          renderTypeList: [FlowNodeInputTypeEnum.password, FlowNodeInputTypeEnum.agentGenerated],
          selectedType: FlowNodeInputTypeEnum.password
        }),
        createMockInput({
          key: NodeInputKeyEnum.systemInputConfig,
          renderTypeList: [FlowNodeInputTypeEnum.agentGenerated]
        })
      ],
      additionalAllowedKeys: ['schemaOnly']
    });

    expect(params).toEqual({
      query: 'model query',
      indexOnly: 'model index value',
      schemaOnly: 'schema value'
    });
  });

  it('should remove agent generated fields from developer configured params', () => {
    const params = filterToolConfiguredParams({
      params: {
        query: 'legacy fixed query',
        apiKey: 'fixed secret'
      },
      inputs: [
        createMockInput({
          key: 'query',
          renderTypeList: [FlowNodeInputTypeEnum.agentGenerated, FlowNodeInputTypeEnum.input],
          selectedType: FlowNodeInputTypeEnum.agentGenerated
        }),
        createMockInput({
          key: 'apiKey',
          renderTypeList: [FlowNodeInputTypeEnum.password],
          selectedType: FlowNodeInputTypeEnum.password
        })
      ]
    });

    expect(params).toEqual({ apiKey: 'fixed secret' });
  });

  it('should initialize fileSelect as agentGenerated while excluding password and custom fields', () => {
    const fileInput = initToolInputTypeByDefaultMode(
      createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.fileSelect],
        toolDescription: 'Files',
        defaultToAgentGenerated: true
      })
    );
    expect(fileInput.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.fileSelect
    ]);
    expect(isAgentGeneratedToolInput(fileInput)).toBe(true);

    for (const renderType of [FlowNodeInputTypeEnum.password, FlowNodeInputTypeEnum.custom]) {
      const input = initToolInputTypeByDefaultMode(
        createMockInput({
          renderTypeList: [renderType],
          toolDescription: 'Excluded',
          defaultToAgentGenerated: true
        })
      );
      expect(input.renderTypeList).toEqual([renderType]);
      expect(isAgentGeneratedToolInput(input)).toBe(false);
    }
  });
});

describe('migrateToolInputConfig', () => {
  it('keeps selected type and value when the type remains allowed', () => {
    const result = migrateToolInputConfig({
      input: createMockInput({
        label: 'New label',
        description: 'New description',
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.textarea],
        value: 'new value',
        toolDescription: 'new tool description'
      }),
      sourceInput: createMockInput({
        label: 'Saved label',
        description: 'Saved description',
        renderTypeList: [FlowNodeInputTypeEnum.input],
        selectedType: FlowNodeInputTypeEnum.input,
        value: 'saved value',
        valueDesc: 'saved value description',
        toolDescription: 'saved tool description'
      })
    });

    expect(result).toMatchObject({
      label: 'Saved label',
      description: 'Saved description',
      selectedType: FlowNodeInputTypeEnum.input,
      value: 'saved value',
      toolDescription: 'new tool description'
    });
    expect(result).not.toHaveProperty('valueDesc');
  });

  it('falls back to the new default type and clears value when the type is removed', () => {
    const result = migrateToolInputConfig({
      input: createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.numberInput, FlowNodeInputTypeEnum.textarea],
        selectedType: FlowNodeInputTypeEnum.numberInput,
        value: 10
      }),
      sourceInput: createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.input],
        selectedType: FlowNodeInputTypeEnum.input,
        value: 'saved value'
      })
    });

    expect(result.selectedType).toBe(FlowNodeInputTypeEnum.numberInput);
    expect(result.value).toBeUndefined();
    expect(result.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.numberInput,
      FlowNodeInputTypeEnum.textarea
    ]);
  });

  it('filters single-select values to the new allowed options', () => {
    const result = migrateToolInputConfig({
      input: createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.select],
        list: [{ value: 'new' }]
      }),
      sourceInput: createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.select],
        selectedType: FlowNodeInputTypeEnum.select,
        value: 'old'
      })
    });

    expect(result.selectedType).toBe(FlowNodeInputTypeEnum.select);
    expect(result.value).toBeUndefined();
  });

  it('filters multiple-select values while preserving compatible options', () => {
    const result = migrateToolInputConfig({
      input: createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.multipleSelect],
        list: [{ value: 'new' }, { value: 'shared' }]
      }),
      sourceInput: createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.multipleSelect],
        selectedType: FlowNodeInputTypeEnum.multipleSelect,
        value: ['old', 'shared']
      })
    });

    expect(result.value).toEqual(['shared']);
  });
});

describe('getAgentToolRuntimeStatus & serializeAgentTool', () => {
  it('allows only aiSystemPrompt, fileUrlList, and userChatInput to be agentGenerated on AgentNode in tool mode', () => {
    const normalizedInputs = AgentNode.inputs.map((input) =>
      normalizeFlowNodeInputType(input, { isTool: true })
    );
    const agentGeneratableKeys = normalizedInputs
      .filter((input) => canInputBeAgentGenerated(input))
      .map((input) => input.key);

    expect(agentGeneratableKeys).toEqual([
      NodeInputKeyEnum.aiSystemPrompt,
      NodeInputKeyEnum.fileUrlList,
      NodeInputKeyEnum.userChatInput
    ]);
    expect(
      normalizedInputs.find((input) => input.key === NodeInputKeyEnum.userChatInput)?.selectedType
    ).toBe(FlowNodeInputTypeEnum.agentGenerated);
  });

  it('derives configuration from current inputs and prioritizes unavailable resources', () => {
    const tool = {
      inputs: [
        createMockInput({
          required: true,
          selectedType: FlowNodeInputTypeEnum.input,
          renderTypeList: [FlowNodeInputTypeEnum.input],
          value: ''
        })
      ]
    };
    expect(getAgentToolRuntimeStatus(tool)).toBe('waitingForConfig');
    tool.inputs[0].value = 0;
    expect(getAgentToolRuntimeStatus(tool)).toBe('configured');
    expect(getAgentToolRuntimeStatus({ ...tool, status: PluginStatusEnum.Offline })).toBe(
      'offline'
    );
    expect(
      getAgentToolRuntimeStatus({ ...tool, pluginData: { status: PluginStatusEnum.Offline } })
    ).toBe('offline');
    expect(
      getAgentToolRuntimeStatus({
        ...tool,
        status: PluginStatusEnum.Offline,
        pluginData: { error: 'resource_no_permission' }
      })
    ).toBe('invalid');
    expect(getAgentToolRuntimeStatus({ inputs: [] })).toBe('noConfig');
    expect(getAgentToolRuntimeStatus({ ...tool, status: PluginStatusEnum.SoonOffline })).toBe(
      'configured'
    );
  });

  it('preserves name, avatar, config, and rawInputs snapshots when serializing unavailable tools', () => {
    const baseInvalidTool = {
      id: 'missing-tool',
      pluginId: 'missing-tool',
      name: 'Missing Tool',
      avatar: 'icon/missing',
      version: '1.0.0',
      templateType: 'personalTool' as const,
      flowNodeType: FlowNodeTypeEnum.tool,
      intro: '',
      inputs: [],
      outputs: [],
      pluginData: { error: 'tool_missing' },
      config: { apiKey: 'secret-key' }
    };

    expect(
      serializeAgentTool({
        tool: {
          ...baseInvalidTool,
          rawInputs: [{ key: 'query', mode: AgentToolInputModeEnum.agentGenerated }]
        }
      })
    ).toEqual({
      id: 'missing-tool',
      name: 'Missing Tool',
      avatar: 'icon/missing',
      version: '1.0.0',
      source: undefined,
      toolConfig: undefined,
      inputs: [{ key: 'query', mode: 'agentGenerated' }],
      config: { apiKey: 'secret-key' }
    });
    expect(serializeAgentTool({ tool: baseInvalidTool }).inputs).toBeUndefined();
  });

  it('omits built-in history only for appModule tools while preserving plugin and tool history inputs', () => {
    const inputs = [
      createMockInput({
        key: NodeInputKeyEnum.forbidStream,
        selectedType: FlowNodeInputTypeEnum.switch,
        renderTypeList: [FlowNodeInputTypeEnum.switch],
        value: true
      }),
      createMockInput({
        key: NodeInputKeyEnum.history,
        selectedType: FlowNodeInputTypeEnum.input,
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
        value: 'order audit history'
      })
    ];
    const serializeWithNodeType = (flowNodeType: FlowNodeTypeEnum) =>
      serializeAgentTool({
        tool: {
          id: 'tool-id',
          pluginId: 'tool-id',
          name: 'Tool',
          avatar: '',
          version: '1.0.0',
          templateType: 'teamApp',
          flowNodeType,
          intro: '',
          inputs,
          outputs: []
        }
      }).config;

    expect(serializeWithNodeType(FlowNodeTypeEnum.appModule)).toEqual({});
    expect(serializeWithNodeType(FlowNodeTypeEnum.pluginModule)).toEqual({
      [NodeInputKeyEnum.history]: 'order audit history'
    });
  });
});
