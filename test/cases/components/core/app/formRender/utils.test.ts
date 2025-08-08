import { describe, expect, it } from 'vitest';
import {
  variableInputTypeToInputType,
  nodeInputTypeToInputType,
  valueTypeToInputType,
  secretInputTypeToInputType
} from '@/components/core/app/formRender/utils';
import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { InputTypeEnum } from '@/components/core/app/formRender/constant';

describe('formRender utils', () => {
  describe('variableInputTypeToInputType', () => {
    it('should convert input types correctly', () => {
      expect(variableInputTypeToInputType(VariableInputEnum.input)).toBe(InputTypeEnum.input);
      expect(variableInputTypeToInputType(VariableInputEnum.textarea)).toBe(InputTypeEnum.textarea);
      expect(variableInputTypeToInputType(VariableInputEnum.numberInput)).toBe(
        InputTypeEnum.numberInput
      );
      expect(variableInputTypeToInputType(VariableInputEnum.select)).toBe(InputTypeEnum.select);
      expect(variableInputTypeToInputType(VariableInputEnum.multipleSelect)).toBe(
        InputTypeEnum.multipleSelect
      );
      expect(variableInputTypeToInputType(VariableInputEnum.password)).toBe(InputTypeEnum.password);
    });

    it('should handle custom input type', () => {
      expect(
        variableInputTypeToInputType(VariableInputEnum.custom, WorkflowIOValueTypeEnum.string)
      ).toBe(InputTypeEnum.input);
      expect(
        variableInputTypeToInputType(VariableInputEnum.custom, WorkflowIOValueTypeEnum.number)
      ).toBe(InputTypeEnum.numberInput);
    });

    it('should handle internal input type', () => {
      expect(
        variableInputTypeToInputType(VariableInputEnum.internal, WorkflowIOValueTypeEnum.string)
      ).toBe(InputTypeEnum.input);
    });

    it('should handle external input type', () => {
      expect(
        variableInputTypeToInputType(VariableInputEnum.external, WorkflowIOValueTypeEnum.string)
      ).toBe(InputTypeEnum.input);
    });

    it('should return JSONEditor for unknown input type', () => {
      expect(variableInputTypeToInputType('unknown' as VariableInputEnum)).toBe(
        InputTypeEnum.JSONEditor
      );
    });
  });

  describe('nodeInputTypeToInputType', () => {
    it('should convert node input types correctly', () => {
      expect(nodeInputTypeToInputType([FlowNodeInputTypeEnum.input])).toBe(InputTypeEnum.input);
      expect(nodeInputTypeToInputType([FlowNodeInputTypeEnum.password])).toBe(
        InputTypeEnum.password
      );
      expect(nodeInputTypeToInputType([FlowNodeInputTypeEnum.textarea])).toBe(
        InputTypeEnum.textarea
      );
      expect(nodeInputTypeToInputType([FlowNodeInputTypeEnum.numberInput])).toBe(
        InputTypeEnum.numberInput
      );
      expect(nodeInputTypeToInputType([FlowNodeInputTypeEnum.switch])).toBe(InputTypeEnum.switch);
      expect(nodeInputTypeToInputType([FlowNodeInputTypeEnum.select])).toBe(InputTypeEnum.select);
      expect(nodeInputTypeToInputType([FlowNodeInputTypeEnum.multipleSelect])).toBe(
        InputTypeEnum.multipleSelect
      );
      expect(nodeInputTypeToInputType([FlowNodeInputTypeEnum.JSONEditor])).toBe(
        InputTypeEnum.JSONEditor
      );
      expect(nodeInputTypeToInputType([FlowNodeInputTypeEnum.selectLLMModel])).toBe(
        InputTypeEnum.selectLLMModel
      );
      expect(nodeInputTypeToInputType([FlowNodeInputTypeEnum.fileSelect])).toBe(
        InputTypeEnum.fileSelect
      );
    });

    it('should ignore reference type and use other type', () => {
      expect(
        nodeInputTypeToInputType([FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.input])
      ).toBe(InputTypeEnum.input);
    });

    it('should return textarea for empty input types', () => {
      expect(nodeInputTypeToInputType([])).toBe(InputTypeEnum.textarea);
    });

    it('should return textarea for unknown input type', () => {
      expect(nodeInputTypeToInputType(['unknown' as FlowNodeInputTypeEnum])).toBe(
        InputTypeEnum.textarea
      );
    });
  });

  describe('valueTypeToInputType', () => {
    it('should convert value types correctly', () => {
      expect(valueTypeToInputType(WorkflowIOValueTypeEnum.string)).toBe(InputTypeEnum.input);
      expect(valueTypeToInputType(WorkflowIOValueTypeEnum.number)).toBe(InputTypeEnum.numberInput);
      expect(valueTypeToInputType(WorkflowIOValueTypeEnum.boolean)).toBe(InputTypeEnum.switch);
      expect(valueTypeToInputType(WorkflowIOValueTypeEnum.object)).toBe(InputTypeEnum.JSONEditor);
      expect(valueTypeToInputType(WorkflowIOValueTypeEnum.arrayString)).toBe(
        InputTypeEnum.multipleSelect
      );
      expect(valueTypeToInputType(WorkflowIOValueTypeEnum.arrayNumber)).toBe(
        InputTypeEnum.JSONEditor
      );
      expect(valueTypeToInputType(WorkflowIOValueTypeEnum.arrayBoolean)).toBe(
        InputTypeEnum.JSONEditor
      );
      expect(valueTypeToInputType(WorkflowIOValueTypeEnum.arrayObject)).toBe(
        InputTypeEnum.JSONEditor
      );
      expect(valueTypeToInputType(WorkflowIOValueTypeEnum.arrayAny)).toBe(InputTypeEnum.JSONEditor);
      expect(valueTypeToInputType(WorkflowIOValueTypeEnum.chatHistory)).toBe(
        InputTypeEnum.JSONEditor
      );
      expect(valueTypeToInputType(WorkflowIOValueTypeEnum.datasetQuote)).toBe(
        InputTypeEnum.JSONEditor
      );
      expect(valueTypeToInputType(WorkflowIOValueTypeEnum.dynamic)).toBe(InputTypeEnum.JSONEditor);
      expect(valueTypeToInputType(WorkflowIOValueTypeEnum.selectDataset)).toBe(
        InputTypeEnum.JSONEditor
      );
      expect(valueTypeToInputType(WorkflowIOValueTypeEnum.selectApp)).toBe(
        InputTypeEnum.JSONEditor
      );
      expect(valueTypeToInputType(WorkflowIOValueTypeEnum.any)).toBe(InputTypeEnum.textarea);
    });

    it('should return textarea for undefined value type', () => {
      expect(valueTypeToInputType(undefined)).toBe(InputTypeEnum.textarea);
    });

    it('should return textarea for unknown value type', () => {
      expect(valueTypeToInputType('unknown' as WorkflowIOValueTypeEnum)).toBe(
        InputTypeEnum.textarea
      );
    });
  });

  describe('secretInputTypeToInputType', () => {
    it('should convert secret input types correctly', () => {
      expect(secretInputTypeToInputType('input')).toBe(InputTypeEnum.input);
      expect(secretInputTypeToInputType('numberInput')).toBe(InputTypeEnum.numberInput);
      expect(secretInputTypeToInputType('switch')).toBe(InputTypeEnum.switch);
      expect(secretInputTypeToInputType('select')).toBe(InputTypeEnum.select);
    });

    it('should return textarea for unknown input type', () => {
      expect(secretInputTypeToInputType('unknown')).toBe(InputTypeEnum.textarea);
    });
  });
});
