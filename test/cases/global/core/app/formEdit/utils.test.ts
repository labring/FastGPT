import { describe, expect, it } from 'vitest';
import {
  validateToolConfiguration,
  checkNeedsUserConfiguration,
  getToolConfigStatus
} from '@fastgpt/global/core/app/formEdit/utils';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
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
      const result = validateToolConfiguration({ toolTemplate });
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
      const result = validateToolConfiguration({ toolTemplate });
      expect(result).toBe(false);
    });

    it('should return false for fileSelect with canUploadFile=false', () => {
      const toolTemplate = createMockToolTemplate([
        createMockInput({ renderTypeList: [FlowNodeInputTypeEnum.fileSelect] })
      ]);
      const result = validateToolConfiguration({ toolTemplate, canUploadFile: false });
      expect(result).toBe(false);
    });

    it('should return false for multiple fileSelect inputs even with canUploadFile', () => {
      const toolTemplate = createMockToolTemplate([
        createMockInput({ key: 'file1', renderTypeList: [FlowNodeInputTypeEnum.fileSelect] }),
        createMockInput({ key: 'file2', renderTypeList: [FlowNodeInputTypeEnum.fileSelect] })
      ]);
      const result = validateToolConfiguration({ toolTemplate, canUploadFile: true });
      expect(result).toBe(false);
    });

    it('should return false for selectDataset input type', () => {
      const toolTemplate = createMockToolTemplate([
        createMockInput({ renderTypeList: [FlowNodeInputTypeEnum.selectDataset] })
      ]);
      const result = validateToolConfiguration({ toolTemplate });
      expect(result).toBe(false);
    });

    it('should return false for addInputParam input type', () => {
      const toolTemplate = createMockToolTemplate([
        createMockInput({ renderTypeList: [FlowNodeInputTypeEnum.addInputParam] })
      ]);
      const result = validateToolConfiguration({ toolTemplate });
      expect(result).toBe(false);
    });

    it('should return false for selectLLMModel input type', () => {
      const toolTemplate = createMockToolTemplate([
        createMockInput({ renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel] })
      ]);
      const result = validateToolConfiguration({ toolTemplate });
      expect(result).toBe(false);
    });

    it('should return false for settingLLMModel input type', () => {
      const toolTemplate = createMockToolTemplate([
        createMockInput({ renderTypeList: [FlowNodeInputTypeEnum.settingLLMModel] })
      ]);
      const result = validateToolConfiguration({ toolTemplate });
      expect(result).toBe(false);
    });

    it('should return false for fileSelect input type (always invalid as special type)', () => {
      const toolTemplate = createMockToolTemplate([
        createMockInput({ renderTypeList: [FlowNodeInputTypeEnum.fileSelect] })
      ]);
      // fileSelect is in the special input types list, so it's always invalid
      const result = validateToolConfiguration({ toolTemplate, canUploadFile: true });
      expect(result).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should return false when any input is invalid among multiple inputs', () => {
      const toolTemplate = createMockToolTemplate([
        createMockInput({ renderTypeList: [FlowNodeInputTypeEnum.input] }),
        createMockInput({ renderTypeList: [FlowNodeInputTypeEnum.selectDataset] }),
        createMockInput({ renderTypeList: [FlowNodeInputTypeEnum.textarea] })
      ]);
      const result = validateToolConfiguration({ toolTemplate });
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

    it('should return false when all inputs have toolDescription', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.input],
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

    it('should return false if all inputs are excluded or have toolDescription', () => {
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
            renderTypeList: [FlowNodeInputTypeEnum.input],
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

    it('should return noConfig when all inputs have toolDescription', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.input],
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
            renderTypeList: [FlowNodeInputTypeEnum.select],
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
            renderTypeList: [FlowNodeInputTypeEnum.select],
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
  });

  describe('edge cases', () => {
    it('should ignore inputs with toolDescription when checking config status', () => {
      const tool = {
        inputs: [
          createMockInput({
            renderTypeList: [FlowNodeInputTypeEnum.input],
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
