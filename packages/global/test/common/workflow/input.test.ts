import { describe, expect, it } from 'vitest';
import {
  getOrInitModuleInputValue,
  projectExternalVariableInput
} from '@fastgpt/global/common/workflow/input';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';

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

  it.each([
    {
      value: 0,
      defaultValue: 42,
      valueType: WorkflowIOValueTypeEnum.number,
      renderType: FlowNodeInputTypeEnum.numberInput
    },
    {
      value: false,
      defaultValue: true,
      valueType: WorkflowIOValueTypeEnum.boolean,
      renderType: FlowNodeInputTypeEnum.switch
    },
    {
      value: '',
      defaultValue: 'default value',
      valueType: WorkflowIOValueTypeEnum.string,
      renderType: FlowNodeInputTypeEnum.input
    }
  ])(
    'should preserve falsy value $value instead of its default',
    ({ value, defaultValue, valueType, renderType }) => {
      const input: FlowNodeInputItemType = {
        key: 'test',
        label: 'Test',
        value,
        defaultValue,
        valueType,
        renderTypeList: [renderType]
      };
      expect(getOrInitModuleInputValue(input)).toBe(value);
    }
  );
});
