import { describe, expect, it } from 'vitest';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import {
  getDebugInputFormProps,
  getDebugInputFormValue,
  getDebugRuntimeInputs
} from '@/pageComponents/app/detail/WorkflowComponents/Flow/hooks/useDebugInput';

const makeInput = (input: Partial<FlowNodeInputItemType>): FlowNodeInputItemType => ({
  key: 'input',
  label: 'Input',
  renderTypeList: [FlowNodeInputTypeEnum.input],
  valueType: WorkflowIOValueTypeEnum.string,
  ...input
});

describe('useDebugInput', () => {
  it('should not use reference value as node debug form default value', () => {
    const input = makeInput({
      key: 'userChatInput',
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.input],
      selectedTypeIndex: 0,
      value: [['workflowStart', 'userChatInput']]
    });

    expect(getDebugInputFormValue(input)).toBeUndefined();
  });

  it('should remove raw value props before rendering debug form fields', () => {
    const input = makeInput({
      value: [['workflowStart', 'userChatInput']],
      defaultValue: 'default'
    });

    const props = getDebugInputFormProps(input);

    expect(props).not.toHaveProperty('value');
    expect(props).not.toHaveProperty('defaultValue');
  });

  it('should clear old reference value when a rendered debug field is submitted empty', () => {
    const referenceInput = makeInput({
      key: 'userChatInput',
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.input],
      selectedTypeIndex: 0,
      value: [['workflowStart', 'userChatInput']]
    });

    const [updatedInput] = getDebugRuntimeInputs({
      inputs: [referenceInput],
      nodeVariables: {
        userChatInput: undefined
      }
    });

    expect(updatedInput.value).toBeUndefined();
  });

  it('should keep inputs that are not shown in the debug form unchanged', () => {
    const hiddenInput = makeInput({
      key: 'temperature',
      valueType: WorkflowIOValueTypeEnum.number,
      value: 0.7
    });

    const [updatedInput] = getDebugRuntimeInputs({
      inputs: [hiddenInput],
      nodeVariables: {}
    });

    expect(updatedInput).toBe(hiddenInput);
  });

  it('should parse json values from debug form', () => {
    const objectInput = makeInput({
      key: 'config',
      valueType: WorkflowIOValueTypeEnum.object,
      value: { old: true }
    });

    const [updatedInput] = getDebugRuntimeInputs({
      inputs: [objectInput],
      nodeVariables: {
        config: '{"new":true}'
      }
    });

    expect(updatedInput.value).toEqual({ new: true });
  });
});
