import { describe, expect, it } from 'vitest';
import {
  validateToolConfiguration,
  canInputBeAgentGenerated,
  canInputBeConfiguredAsToolParam,
  canInputBeManuallyConfigured,
  checkNeedsUserConfiguration,
  filterAgentGeneratedToolParams,
  filterToolConfiguredParams,
  getToolInputDisplayRenderTypeList,
  getToolInputManualRenderType,
  getToolConfigStatus,
  initToolInputTypeByDefaultMode,
  isAgentGeneratedToolInput,
  stripToolInputDefaultMode
} from '@fastgpt/global/core/app/formEdit/utils';
import {
  getLegacySavedToolInputSelectedType as getSavedToolInputSelectedType,
  migrateLegacyFlowNodeInputToCurrent as normalizeFlowNodeInputType,
  migrateLegacyWorkflowHttpToolInputsDefaultMode as normalizeLegacyWorkflowHttpToolInputsDefaultMode
} from '@fastgpt/global/core/workflow/migration';
import {
  FlowNodeInputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum, WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
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

    it('should return false for fileSelect without canUploadFile', () => {
      const toolTemplate = createMockToolTemplate([
        createMockInput({ renderTypeList: [FlowNodeInputTypeEnum.fileSelect] })
      ]);
      const result = validateToolConfiguration({ toolTemplate, isAppTool: true });
      expect(result).toBe(false);
    });

    it('should return false for fileSelect with canUploadFile=false', () => {
      const toolTemplate = createMockToolTemplate([
        createMockInput({ renderTypeList: [FlowNodeInputTypeEnum.fileSelect] })
      ]);
      const result = validateToolConfiguration({
        toolTemplate,
        canUploadFile: false,
        isAppTool: true
      });
      expect(result).toBe(false);
    });

    it('should return false for multiple fileSelect inputs even with canUploadFile', () => {
      const toolTemplate = createMockToolTemplate([
        createMockInput({ key: 'file1', renderTypeList: [FlowNodeInputTypeEnum.fileSelect] }),
        createMockInput({ key: 'file2', renderTypeList: [FlowNodeInputTypeEnum.fileSelect] })
      ]);
      const result = validateToolConfiguration({
        toolTemplate,
        canUploadFile: true,
        isAppTool: true
      });
      expect(result).toBe(false);
    });

    it.each([
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

      expect(validateToolConfiguration({ toolTemplate, isAppTool: true })).toBe(false);
    });

    it('should return false for fileSelect input type (always invalid as special type)', () => {
      const toolTemplate = createMockToolTemplate([
        createMockInput({ renderTypeList: [FlowNodeInputTypeEnum.fileSelect] })
      ]);
      // fileSelect is in the special input types list, so it's always invalid
      const result = validateToolConfiguration({
        toolTemplate,
        canUploadFile: true,
        isAppTool: true
      });
      expect(result).toBe(false);
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

    it('should return false for forbidStream input', () => {
      const tool = {
        inputs: [
          createMockInput({
            key: NodeInputKeyEnum.forbidStream,
            renderTypeList: [FlowNodeInputTypeEnum.switch]
          })
        ]
      };
      const result = checkNeedsUserConfiguration(tool);
      expect(result).toBe(false);
    });

    it('should return false for history input', () => {
      const tool = {
        inputs: [
          createMockInput({
            key: NodeInputKeyEnum.history,
            renderTypeList: [FlowNodeInputTypeEnum.input]
          })
        ]
      };
      const result = checkNeedsUserConfiguration(tool);
      expect(result).toBe(false);
    });

    it('should return false for non-form render types', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.reference]
          })
        ]
      };
      const result = checkNeedsUserConfiguration(tool);
      expect(result).toBe(false);
    });

    it('should return false for hidden render type', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.hidden]
          })
        ]
      };
      const result = checkNeedsUserConfiguration(tool);
      expect(result).toBe(false);
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
      const result = checkNeedsUserConfiguration(tool);
      expect(result).toBe(true);
    });

    it('should return true for input render type without toolDescription', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.input]
          })
        ]
      };
      const result = checkNeedsUserConfiguration(tool);
      expect(result).toBe(true);
    });

    it('should return true for textarea render type without toolDescription', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.textarea]
          })
        ]
      };
      const result = checkNeedsUserConfiguration(tool);
      expect(result).toBe(true);
    });

    it('should return true for numberInput render type without toolDescription', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.numberInput]
          })
        ]
      };
      const result = checkNeedsUserConfiguration(tool);
      expect(result).toBe(true);
    });

    it('should return true for password render type without toolDescription', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.password]
          })
        ]
      };
      const result = checkNeedsUserConfiguration(tool);
      expect(result).toBe(true);
    });

    it('should return true for switch render type without toolDescription', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.switch]
          })
        ]
      };
      const result = checkNeedsUserConfiguration(tool);
      expect(result).toBe(true);
    });

    it('should return true for select render type without toolDescription', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.select]
          })
        ]
      };
      const result = checkNeedsUserConfiguration(tool);
      expect(result).toBe(true);
    });

    it('should return true for multipleSelect render type without toolDescription', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.multipleSelect]
          })
        ]
      };
      const result = checkNeedsUserConfiguration(tool);
      expect(result).toBe(true);
    });

    it('should return true for JSONEditor render type without toolDescription', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.JSONEditor]
          })
        ]
      };
      const result = checkNeedsUserConfiguration(tool);
      expect(result).toBe(true);
    });

    it('should return true for timePointSelect render type without toolDescription', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.timePointSelect]
          })
        ]
      };
      const result = checkNeedsUserConfiguration(tool);
      expect(result).toBe(true);
    });

    it('should return true for timeRangeSelect render type without toolDescription', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.timeRangeSelect]
          })
        ]
      };
      const result = checkNeedsUserConfiguration(tool);
      expect(result).toBe(true);
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

describe('getToolConfigStatus', () => {
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
    it('should return configured when required input has value', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.input],
            required: true,
            value: 'some value'
          })
        ]
      };
      const result = getToolConfigStatus({ tool });
      expect(result).toEqual({
        needConfig: false,
        status: 'configured'
      });
    });

    it('should return configured when required input falls back to defaultValue', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.input],
            required: true,
            value: undefined,
            defaultValue: 'default value'
          })
        ]
      };

      expect(getToolConfigStatus({ tool })).toEqual({
        needConfig: false,
        status: 'configured'
      });
    });

    it('should return configured when all required inputs have values', () => {
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
          })
        ]
      };
      const result = getToolConfigStatus({ tool });
      expect(result).toEqual({
        needConfig: false,
        status: 'configured'
      });
    });

    it('should return configured when required input has non-empty array value', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.multipleSelect],
            required: true,
            value: ['option1', 'option2']
          })
        ]
      };
      const result = getToolConfigStatus({ tool });
      expect(result).toEqual({
        needConfig: false,
        status: 'configured'
      });
    });

    it('should return configured when required input has non-empty object value', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.JSONEditor],
            required: true,
            value: { key: 'value' }
          })
        ]
      };
      const result = getToolConfigStatus({ tool });
      expect(result).toEqual({
        needConfig: false,
        status: 'configured'
      });
    });

    it('should return configured when optional inputs are empty but required inputs are filled', () => {
      const tool = {
        inputs: [
          createMockInput({
            key: 'required',
            renderTypeList: [FlowNodeInputTypeEnum.input],
            required: true,
            value: 'filled'
          }),
          createMockInput({
            key: 'optional',
            renderTypeList: [FlowNodeInputTypeEnum.input],
            required: false,
            value: ''
          })
        ]
      };
      const result = getToolConfigStatus({ tool });
      expect(result).toEqual({
        needConfig: false,
        status: 'configured'
      });
    });
  });

  describe('waitingForConfig status', () => {
    it('should return waitingForConfig when required input has no value', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.input],
            required: true,
            value: undefined
          })
        ]
      };
      const result = getToolConfigStatus({ tool });
      expect(result).toEqual({
        needConfig: true,
        status: 'waitingForConfig'
      });
    });

    it('should return waitingForConfig when required input has null value', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.input],
            required: true,
            value: null
          })
        ]
      };
      const result = getToolConfigStatus({ tool });
      expect(result).toEqual({
        needConfig: true,
        status: 'waitingForConfig'
      });
    });

    it('should return waitingForConfig when required input has empty string value', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.input],
            required: true,
            value: ''
          })
        ]
      };
      const result = getToolConfigStatus({ tool });
      expect(result).toEqual({
        needConfig: true,
        status: 'waitingForConfig'
      });
    });

    it('should return waitingForConfig when required input has empty array value', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.multipleSelect],
            required: true,
            value: []
          })
        ]
      };
      const result = getToolConfigStatus({ tool });
      expect(result).toEqual({
        needConfig: true,
        status: 'waitingForConfig'
      });
    });

    it('should return waitingForConfig when required time range is incomplete', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.timeRangeSelect],
            required: true,
            value: ['2026-07-07T00:00:00+08:00', undefined]
          })
        ]
      };
      const result = getToolConfigStatus({ tool });
      expect(result).toEqual({
        needConfig: true,
        status: 'waitingForConfig'
      });
    });

    it('should return waitingForConfig when required input has empty object value', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.JSONEditor],
            required: true,
            value: {}
          })
        ]
      };
      const result = getToolConfigStatus({ tool });
      expect(result).toEqual({
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
      const result = getToolConfigStatus({ tool });
      expect(result).toEqual({
        needConfig: true,
        status: 'waitingForConfig'
      });
    });

    it('should return waitingForConfig for systemInputConfig key', () => {
      const tool = {
        inputs: [
          createMockInput({
            key: NodeInputKeyEnum.systemInputConfig,
            renderTypeList: [FlowNodeInputTypeEnum.custom],
            value: undefined
          })
        ]
      };
      const result = getToolConfigStatus({ tool });
      expect(result).toEqual({
        needConfig: true,
        status: 'waitingForConfig'
      });
    });

    it('should return waitingForConfig when developer-configured required input keeps toolDescription', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
            required: true,
            toolDescription: 'Legacy description',
            value: ''
          })
        ]
      };
      const result = getToolConfigStatus({ tool });
      expect(result).toEqual({
        needConfig: true,
        status: 'waitingForConfig'
      });
    });

    it('should return waitingForConfig when invalid agent-generated input still needs developer config', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.agentGenerated, FlowNodeInputTypeEnum.password],
            required: true,
            toolDescription: 'API key',
            value: ''
          })
        ]
      };
      const result = getToolConfigStatus({ tool });
      expect(result).toEqual({
        needConfig: true,
        status: 'waitingForConfig'
      });
    });
  });

  describe('edge cases', () => {
    it('should ignore agent-generated inputs when checking config status', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.agentGenerated, FlowNodeInputTypeEnum.input],
            selectedType: FlowNodeInputTypeEnum.agentGenerated,
            required: true,
            toolDescription: 'Has description',
            value: ''
          })
        ]
      };
      const result = getToolConfigStatus({ tool });
      expect(result).toEqual({
        needConfig: false,
        status: 'noConfig'
      });
    });

    it('should handle boolean false value as valid', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.switch],
            required: true,
            value: false
          })
        ]
      };
      const result = getToolConfigStatus({ tool });
      expect(result).toEqual({
        needConfig: false,
        status: 'configured'
      });
    });

    it('should handle number 0 value as valid', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.numberInput],
            required: true,
            value: 0
          })
        ]
      };
      const result = getToolConfigStatus({ tool });
      expect(result).toEqual({
        needConfig: false,
        status: 'configured'
      });
    });
  });
});

describe('agent generated tool input helpers', () => {
  it('should restore only legacy editable HTTP tool params', () => {
    const legacyInput = createMockInput({
      canEdit: true,
      toolDescription: 'Generated query',
      renderTypeList: [FlowNodeInputTypeEnum.reference]
    });
    const explicitManualInput = createMockInput({
      key: 'manual',
      canEdit: true,
      toolDescription: 'Manual query',
      isToolParam: false
    });
    const selectedManualInput = createMockInput({
      key: 'selected-manual',
      canEdit: true,
      toolDescription: 'Selected manual query',
      selectedType: FlowNodeInputTypeEnum.reference
    });
    const staticInput = createMockInput({
      key: 'static',
      toolDescription: 'Static input'
    });
    const emptyDescriptionInput = createMockInput({
      key: 'empty-description',
      canEdit: true,
      toolDescription: ''
    });
    const unsafeInput = createMockInput({
      key: 'unsafe',
      canEdit: true,
      toolDescription: 'Secret input',
      renderTypeList: [FlowNodeInputTypeEnum.password]
    });

    const result = normalizeLegacyWorkflowHttpToolInputsDefaultMode([
      legacyInput,
      explicitManualInput,
      selectedManualInput,
      staticInput,
      emptyDescriptionInput,
      unsafeInput
    ]);

    expect(result[0]).toMatchObject({ isToolParam: true });
    expect(result[1]).toBe(explicitManualInput);
    expect(result[2]).toBe(selectedManualInput);
    expect(result[3]).toBe(staticInput);
    expect(result[4]).toBe(emptyDescriptionInput);
    expect(result[5]).toBe(unsafeInput);
  });

  it.each([
    FlowNodeInputTypeEnum.hidden,
    FlowNodeInputTypeEnum.fileSelect,
    FlowNodeInputTypeEnum.selectDataset,
    FlowNodeInputTypeEnum.selectLLMModel,
    FlowNodeInputTypeEnum.customVariable
  ])('should hide unsupported parent tool configuration type %s', (renderType) => {
    expect(canInputBeConfiguredAsToolParam(createMockInput({ renderTypeList: [renderType] }))).toBe(
      false
    );
  });

  it('should migrate selectedTypeIndex and remove it from the normalized input', () => {
    const input = normalizeFlowNodeInputType(
      createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.numberInput],
        selectedTypeIndex: 1
      })
    );

    expect(input.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.reference,
      FlowNodeInputTypeEnum.numberInput
    ]);
    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.numberInput);
    expect(input).not.toHaveProperty('selectedTypeIndex');
  });

  it('should add agentGenerated to supported tool inputs and apply isToolParam default', () => {
    const input = normalizeFlowNodeInputType(
      createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.numberInput, FlowNodeInputTypeEnum.reference],
        selectedTypeIndex: 0,
        isToolParam: true
      }),
      { isTool: true }
    );

    expect(input.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.numberInput,
      FlowNodeInputTypeEnum.reference
    ]);
    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.agentGenerated);
    expect(input).not.toHaveProperty('selectedTypeIndex');
  });

  it('should preserve an explicit manual selectedType in tool context', () => {
    const input = normalizeFlowNodeInputType(
      createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
        selectedType: FlowNodeInputTypeEnum.input,
        selectedTypeIndex: 1,
        isToolParam: true
      }),
      { isTool: true }
    );

    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.input);
    expect(input).not.toHaveProperty('selectedTypeIndex');
  });

  it('should remove agentGenerated from unsupported input types', () => {
    const input = normalizeFlowNodeInputType(
      createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.agentGenerated, FlowNodeInputTypeEnum.fileSelect],
        selectedType: FlowNodeInputTypeEnum.agentGenerated,
        isToolParam: true
      }),
      { isTool: true }
    );

    expect(input.renderTypeList).toEqual([FlowNodeInputTypeEnum.fileSelect]);
    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.fileSelect);
  });

  it('should only use toolDescription when the caller enables legacy fallback', () => {
    const legacyInput = createMockInput({
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
      toolDescription: 'Legacy model description'
    });

    expect(normalizeFlowNodeInputType(legacyInput, { isTool: true }).selectedType).toBe(
      FlowNodeInputTypeEnum.input
    );
    expect(
      normalizeFlowNodeInputType(legacyInput, {
        isTool: true,
        allowLegacyToolDescriptionFallback: true
      }).selectedType
    ).toBe(FlowNodeInputTypeEnum.agentGenerated);
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
        isToolParam: true
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

  it('should preserve an explicit reference-only selection in workflow tool context', () => {
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
        selectedType: FlowNodeInputTypeEnum.reference,
        selectedTypeIndex: 0
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

  it('should migrate saved reference-only selection to agent generated mode', () => {
    const selectedType = getSavedToolInputSelectedType({
      savedInput: createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.reference],
        selectedType: FlowNodeInputTypeEnum.reference,
        selectedTypeIndex: 0
      }),
      defaultInput: createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.reference]
      })
    });

    expect(selectedType).toBe(FlowNodeInputTypeEnum.agentGenerated);
  });

  it('should initialize isToolParam input as agent generated by default', () => {
    const input = initToolInputTypeByDefaultMode(
      createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
        toolDescription: 'Prompt to model',
        isToolParam: true
      })
    );

    expect(input.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.input,
      FlowNodeInputTypeEnum.reference
    ]);
    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.agentGenerated);
    expect(input).not.toHaveProperty('selectedTypeIndex');
    expect(isAgentGeneratedToolInput(input)).toBe(true);
  });

  it('should force the default mode over a preview input selection', () => {
    const input = initToolInputTypeByDefaultMode(
      createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
        selectedType: FlowNodeInputTypeEnum.input,
        selectedTypeIndex: 0,
        isToolParam: true
      }),
      { forceDefaultMode: true }
    );

    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.agentGenerated);
    expect(input).not.toHaveProperty('selectedTypeIndex');
    expect(isAgentGeneratedToolInput(input)).toBe(true);
  });

  it('should remove isToolParam from a persisted tool input', () => {
    const input = createMockInput({ isToolParam: true });
    const persistedInput = stripToolInputDefaultMode(input);

    expect(persistedInput).not.toHaveProperty('isToolParam');
    expect(input.isToolParam).toBe(true);
  });

  it('should keep developer-configured input when isToolParam is not true', () => {
    const input = initToolInputTypeByDefaultMode(
      createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
        toolDescription: 'Prompt to model'
      })
    );

    expect(input.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.input,
      FlowNodeInputTypeEnum.reference
    ]);
    expect(isAgentGeneratedToolInput(input)).toBe(false);
  });

  it('should keep developer-configured input when isToolParam is false', () => {
    const input = initToolInputTypeByDefaultMode(
      createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
        toolDescription: 'Prompt to model',
        isToolParam: false
      })
    );

    expect(input.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.input,
      FlowNodeInputTypeEnum.reference
    ]);
    expect(isAgentGeneratedToolInput(input)).toBe(false);
  });

  it('should keep built-in user chat input manual outside a tool context', () => {
    const input = initToolInputTypeByDefaultMode(
      createMockInput({
        key: NodeInputKeyEnum.userChatInput,
        renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
        toolDescription: 'User question',
        isToolParam: true
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
        toolDescription: 'User question',
        isToolParam: true
      }),
      { allowUserChatInputAgentGenerated: true }
    );

    expect(input.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.reference,
      FlowNodeInputTypeEnum.textarea
    ]);
    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.agentGenerated);
    expect(input).not.toHaveProperty('selectedTypeIndex');
    expect(isAgentGeneratedToolInput(input)).toBe(true);
  });

  it('should keep explicit false isToolParam for user chat input', () => {
    const input = initToolInputTypeByDefaultMode(
      createMockInput({
        key: NodeInputKeyEnum.userChatInput,
        renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
        isToolParam: false
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

  it('should preserve legacy user chat input reference selection', () => {
    const selectedType = getSavedToolInputSelectedType({
      savedInput: createMockInput({
        key: NodeInputKeyEnum.userChatInput,
        renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
        selectedType: FlowNodeInputTypeEnum.reference,
        selectedTypeIndex: 0
      }),
      defaultInput: createMockInput({
        key: NodeInputKeyEnum.userChatInput,
        renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea]
      })
    });

    expect(selectedType).toBe(FlowNodeInputTypeEnum.reference);
  });

  it('should remove a legacy agent generated selection from user chat input when disabled', () => {
    const input = initToolInputTypeByDefaultMode(
      createMockInput({
        key: NodeInputKeyEnum.userChatInput,
        renderTypeList: [
          FlowNodeInputTypeEnum.agentGenerated,
          FlowNodeInputTypeEnum.reference,
          FlowNodeInputTypeEnum.textarea
        ],
        selectedType: FlowNodeInputTypeEnum.agentGenerated,
        selectedTypeIndex: 0
      }),
      { allowUserChatInputAgentGenerated: false }
    );

    expect(input.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.reference,
      FlowNodeInputTypeEnum.textarea
    ]);
    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.reference);
    expect(input).not.toHaveProperty('selectedTypeIndex');
    expect(isAgentGeneratedToolInput(input)).toBe(false);
  });

  it('should preserve a saved agent generated selection for user chat input', () => {
    const selectedType = getSavedToolInputSelectedType({
      savedInput: createMockInput({
        key: NodeInputKeyEnum.userChatInput,
        renderTypeList: [
          FlowNodeInputTypeEnum.agentGenerated,
          FlowNodeInputTypeEnum.reference,
          FlowNodeInputTypeEnum.textarea
        ],
        selectedType: FlowNodeInputTypeEnum.agentGenerated,
        selectedTypeIndex: 0
      }),
      defaultInput: createMockInput({
        key: NodeInputKeyEnum.userChatInput,
        renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea]
      })
    });

    expect(selectedType).toBe(FlowNodeInputTypeEnum.agentGenerated);
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

  it('should treat legacy selectedTypeIndex 0 as default for new isToolParam inputs', () => {
    const selectedType = getSavedToolInputSelectedType({
      savedInput: createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
        selectedTypeIndex: 0
      }),
      defaultInput: createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
        isToolParam: true
      })
    });

    expect(selectedType).toBeUndefined();
  });

  it('should preserve legacy non-zero selectedTypeIndex as an explicit selection', () => {
    const selectedType = getSavedToolInputSelectedType({
      savedInput: createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
        selectedTypeIndex: 1
      }),
      defaultInput: createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
        isToolParam: true
      })
    });

    expect(selectedType).toBe(FlowNodeInputTypeEnum.reference);
  });

  it('should migrate persisted toolDescription to agent generated selection', () => {
    const selectedType = getSavedToolInputSelectedType({
      savedInput: createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.numberInput, FlowNodeInputTypeEnum.reference],
        toolDescription: 'Number generated by AI'
      }),
      defaultInput: createMockInput({
        valueType: WorkflowIOValueTypeEnum.number,
        renderTypeList: [FlowNodeInputTypeEnum.numberInput, FlowNodeInputTypeEnum.reference]
      }),
      allowLegacyToolDescriptionFallback: true
    });

    expect(selectedType).toBe(FlowNodeInputTypeEnum.agentGenerated);
  });

  it('should use the current tool definition when legacy Agent V2 did not persist inputs', () => {
    const selectedType = getSavedToolInputSelectedType({
      defaultInput: createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
        toolDescription: 'Generated by AI'
      }),
      allowLegacyToolDescriptionFallback: true
    });

    expect(selectedType).toBe(FlowNodeInputTypeEnum.agentGenerated);
  });

  it('should preserve an explicit current isToolParam false without saved inputs', () => {
    const selectedType = getSavedToolInputSelectedType({
      defaultInput: createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.reference],
        isToolParam: false,
        toolDescription: 'Generated by AI'
      }),
      allowLegacyToolDescriptionFallback: true
    });

    expect(selectedType).toBeUndefined();
  });

  it('should preserve a persisted manual type without toolDescription', () => {
    const selectedType = getSavedToolInputSelectedType({
      savedInput: createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.numberInput, FlowNodeInputTypeEnum.reference]
      }),
      defaultInput: createMockInput({
        valueType: WorkflowIOValueTypeEnum.number,
        renderTypeList: [FlowNodeInputTypeEnum.numberInput, FlowNodeInputTypeEnum.reference],
        isToolParam: true
      }),
      allowLegacyToolDescriptionFallback: true
    });

    expect(selectedType).toBe(FlowNodeInputTypeEnum.numberInput);
  });

  it('should preserve a transitional indexed selection with agentGenerated available', () => {
    const selectedType = getSavedToolInputSelectedType({
      savedInput: createMockInput({
        renderTypeList: [
          FlowNodeInputTypeEnum.agentGenerated,
          FlowNodeInputTypeEnum.numberInput,
          FlowNodeInputTypeEnum.reference
        ],
        selectedTypeIndex: 1,
        toolDescription: 'Number generated by AI'
      }),
      defaultInput: createMockInput({
        valueType: WorkflowIOValueTypeEnum.number,
        renderTypeList: [FlowNodeInputTypeEnum.numberInput, FlowNodeInputTypeEnum.reference],
        isToolParam: true
      }),
      allowLegacyToolDescriptionFallback: true
    });

    expect(selectedType).toBe(FlowNodeInputTypeEnum.numberInput);
  });

  it('should restore number input as manual type from valueType when render type was collapsed', () => {
    const manualType = getToolInputManualRenderType(
      createMockInput({
        valueType: WorkflowIOValueTypeEnum.number,
        renderTypeList: [FlowNodeInputTypeEnum.agentGenerated, FlowNodeInputTypeEnum.input],
        selectedType: FlowNodeInputTypeEnum.agentGenerated
      })
    );

    expect(manualType).toBe(FlowNodeInputTypeEnum.numberInput);
  });

  it('should restore number input when selected manual type degraded to textarea', () => {
    const manualType = getToolInputManualRenderType(
      createMockInput({
        valueType: WorkflowIOValueTypeEnum.number,
        renderTypeList: [
          FlowNodeInputTypeEnum.agentGenerated,
          FlowNodeInputTypeEnum.numberInput,
          FlowNodeInputTypeEnum.textarea
        ],
        selectedType: FlowNodeInputTypeEnum.textarea
      })
    );

    expect(manualType).toBe(FlowNodeInputTypeEnum.numberInput);
  });

  it('should preserve textarea for string inputs when it is the only manual candidate', () => {
    const manualType = getToolInputManualRenderType(
      createMockInput({
        valueType: WorkflowIOValueTypeEnum.string,
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

  it('should restore text input when a string input carries a stale select type', () => {
    const manualType = getToolInputManualRenderType(
      createMockInput({
        valueType: WorkflowIOValueTypeEnum.string,
        renderTypeList: [
          FlowNodeInputTypeEnum.agentGenerated,
          FlowNodeInputTypeEnum.input,
          FlowNodeInputTypeEnum.select,
          FlowNodeInputTypeEnum.reference
        ],
        selectedType: FlowNodeInputTypeEnum.select
      })
    );

    expect(manualType).toBe(FlowNodeInputTypeEnum.input);
  });

  it('should ignore empty option placeholders when resolving the manual input type', () => {
    const manualType = getToolInputManualRenderType(
      createMockInput({
        valueType: WorkflowIOValueTypeEnum.string,
        list: [{ label: '', value: '' }],
        renderTypeList: [
          FlowNodeInputTypeEnum.agentGenerated,
          FlowNodeInputTypeEnum.input,
          FlowNodeInputTypeEnum.select,
          FlowNodeInputTypeEnum.reference
        ],
        selectedType: FlowNodeInputTypeEnum.select
      })
    );

    expect(manualType).toBe(FlowNodeInputTypeEnum.input);
  });

  it('should keep a strict string select when options are available', () => {
    const manualType = getToolInputManualRenderType(
      createMockInput({
        valueType: WorkflowIOValueTypeEnum.string,
        list: [{ label: 'A', value: 'a' }],
        renderTypeList: [FlowNodeInputTypeEnum.agentGenerated, FlowNodeInputTypeEnum.select],
        selectedType: FlowNodeInputTypeEnum.select
      })
    );

    expect(manualType).toBe(FlowNodeInputTypeEnum.select);
  });

  it('should collapse duplicate manual input options to the preferred string control', () => {
    const renderTypeList = getToolInputDisplayRenderTypeList({
      input: createMockInput({
        valueType: WorkflowIOValueTypeEnum.string,
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

  it.each([
    {
      valueType: WorkflowIOValueTypeEnum.number,
      expectedType: FlowNodeInputTypeEnum.numberInput
    },
    {
      valueType: WorkflowIOValueTypeEnum.object,
      expectedType: FlowNodeInputTypeEnum.JSONEditor
    }
  ])('should preserve $expectedType as the only manual option', ({ valueType, expectedType }) => {
    const renderTypeList = getToolInputDisplayRenderTypeList({
      input: createMockInput({
        valueType,
        renderTypeList: [
          FlowNodeInputTypeEnum.agentGenerated,
          FlowNodeInputTypeEnum.input,
          FlowNodeInputTypeEnum.textarea,
          expectedType,
          FlowNodeInputTypeEnum.reference
        ]
      }),
      showAgentGenerated: true
    });

    expect(renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      expectedType,
      FlowNodeInputTypeEnum.reference
    ]);
  });

  it('should preserve multipleSelect as the only manual option for array enums', () => {
    const renderTypeList = getToolInputDisplayRenderTypeList({
      input: createMockInput({
        valueType: WorkflowIOValueTypeEnum.arrayString,
        list: [{ label: 'A', value: 'a' }],
        renderTypeList: [
          FlowNodeInputTypeEnum.agentGenerated,
          FlowNodeInputTypeEnum.input,
          FlowNodeInputTypeEnum.select,
          FlowNodeInputTypeEnum.multipleSelect,
          FlowNodeInputTypeEnum.reference
        ]
      }),
      showAgentGenerated: true
    });

    expect(renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.multipleSelect,
      FlowNodeInputTypeEnum.reference
    ]);
  });

  it('should migrate legacy index zero to the isToolParam default mode', () => {
    const input = initToolInputTypeByDefaultMode(
      createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
        selectedTypeIndex: 0,
        toolDescription: 'Prompt to model',
        isToolParam: true
      })
    );

    expect(input.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.input
    ]);
    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.agentGenerated);
    expect(input).not.toHaveProperty('selectedTypeIndex');
    expect(isAgentGeneratedToolInput(input)).toBe(true);
  });

  it('should migrate a legacy user chat input index zero to agent generated in tool context', () => {
    const input = initToolInputTypeByDefaultMode(
      createMockInput({
        key: NodeInputKeyEnum.userChatInput,
        renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
        selectedTypeIndex: 0,
        isToolParam: true,
        required: true
      }),
      { allowUserChatInputAgentGenerated: true }
    );

    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.agentGenerated);
    expect(isAgentGeneratedToolInput(input)).toBe(true);
  });

  it('should preserve an explicit selected reference type for user chat input', () => {
    const input = initToolInputTypeByDefaultMode(
      createMockInput({
        key: NodeInputKeyEnum.userChatInput,
        renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
        selectedType: FlowNodeInputTypeEnum.reference,
        selectedTypeIndex: 0,
        required: true
      }),
      { allowUserChatInputAgentGenerated: true }
    );

    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.reference);
    expect(isAgentGeneratedToolInput(input)).toBe(false);
  });

  it('should initialize isToolParam as agent generated when option exists but no final type is saved', () => {
    const input = initToolInputTypeByDefaultMode(
      createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
        toolDescription: 'Prompt to model',
        isToolParam: true
      })
    );

    expect(input.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.input
    ]);
    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.agentGenerated);
    expect(input).not.toHaveProperty('selectedTypeIndex');
    expect(isAgentGeneratedToolInput(input)).toBe(true);
  });

  it('should preserve legacy selectedTypeIndex developer mode before applying isToolParam default', () => {
    const input = normalizeFlowNodeInputType(
      createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.input],
        selectedTypeIndex: 1,
        toolDescription: 'Prompt to model',
        isToolParam: true
      }),
      { isTool: true }
    );

    expect(input.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.reference,
      FlowNodeInputTypeEnum.input
    ]);
    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.input);
    expect(input).not.toHaveProperty('selectedTypeIndex');
    expect(isAgentGeneratedToolInput(input)).toBe(false);
  });

  it('should detect agent generated mode from selectedTypeIndex', () => {
    const input = initToolInputTypeByDefaultMode(
      createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
        selectedTypeIndex: 1,
        toolDescription: 'Prompt to model',
        isToolParam: true
      })
    );

    expect(input.renderTypeList).toEqual([
      FlowNodeInputTypeEnum.agentGenerated,
      FlowNodeInputTypeEnum.input
    ]);
    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.agentGenerated);
    expect(input).not.toHaveProperty('selectedTypeIndex');
    expect(isAgentGeneratedToolInput(input)).toBe(true);
  });

  it('should prefer selectedType over deprecated selectedTypeIndex', () => {
    const input = initToolInputTypeByDefaultMode(
      createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
        selectedType: FlowNodeInputTypeEnum.agentGenerated,
        selectedTypeIndex: 0,
        toolDescription: 'Prompt to model',
        isToolParam: true
      })
    );

    expect(input.selectedType).toBe(FlowNodeInputTypeEnum.agentGenerated);
    expect(isAgentGeneratedToolInput(input)).toBe(true);
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
          selectedType: FlowNodeInputTypeEnum.agentGenerated,
          selectedTypeIndex: 0
        }),
        createMockInput({
          key: 'indexOnly',
          renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
          selectedType: FlowNodeInputTypeEnum.agentGenerated
        }),
        createMockInput({
          key: 'manualText',
          renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
          selectedTypeIndex: 0
        }),
        createMockInput({
          key: 'password',
          renderTypeList: [FlowNodeInputTypeEnum.password, FlowNodeInputTypeEnum.agentGenerated],
          selectedTypeIndex: 1
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

  it('should not initialize file fields as agent generated', () => {
    const input = initToolInputTypeByDefaultMode(
      createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.fileSelect],
        toolDescription: 'Files',
        isToolParam: true
      })
    );

    expect(input.renderTypeList).toEqual([FlowNodeInputTypeEnum.fileSelect]);
    expect(isAgentGeneratedToolInput(input)).toBe(false);
  });

  it('should not initialize password fields as agent generated', () => {
    const input = initToolInputTypeByDefaultMode(
      createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.password],
        toolDescription: 'API key',
        isToolParam: true
      })
    );

    expect(input.renderTypeList).toEqual([FlowNodeInputTypeEnum.password]);
    expect(isAgentGeneratedToolInput(input)).toBe(false);
  });

  it('should not initialize custom render fields as agent generated', () => {
    const input = initToolInputTypeByDefaultMode(
      createMockInput({
        renderTypeList: [FlowNodeInputTypeEnum.custom],
        toolDescription: 'Custom renderer',
        isToolParam: true
      })
    );

    expect(input.renderTypeList).toEqual([FlowNodeInputTypeEnum.custom]);
    expect(isAgentGeneratedToolInput(input)).toBe(false);
  });
});
