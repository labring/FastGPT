import { describe, expect, it } from 'vitest';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import {
  checkInputShouldRenderInDebug,
  getDebugInputFormProps,
  getDebugInputFormValue,
  getDebugInputRenderTypeList,
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
  it('should render reference inputs that have a normal debug form type', () => {
    const input = makeInput({
      key: 'userChatInput',
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
      selectedTypeIndex: 0,
      value: [['workflowStart', 'userChatInput']]
    });

    expect(checkInputShouldRenderInDebug(input)).toBe(true);
    expect(getDebugInputRenderTypeList(input)).toEqual([FlowNodeInputTypeEnum.textarea]);
  });

  it('should not render reference-only config inputs in node debug form', () => {
    const input = makeInput({
      key: 'datasetSelectList',
      renderTypeList: [
        FlowNodeInputTypeEnum.reference,
        FlowNodeInputTypeEnum.selectDatasetParamsModal
      ],
      selectedTypeIndex: 0,
      value: [['workflowStart', 'datasetSelectList']]
    });

    expect(checkInputShouldRenderInDebug(input)).toBe(false);
    expect(getDebugInputRenderTypeList(input)).toEqual([]);
  });

  it('should not render hidden dataset search config inputs in node debug form', () => {
    const input = makeInput({
      key: 'datasetSearchUsingExtensionQuery',
      label: '',
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      valueType: WorkflowIOValueTypeEnum.boolean,
      value: true
    });

    expect(checkInputShouldRenderInDebug(input)).toBe(false);
  });

  it('should keep false and zero values from being treated as missing debug inputs', () => {
    const booleanInput = makeInput({
      key: 'enable',
      renderTypeList: [FlowNodeInputTypeEnum.switch],
      valueType: WorkflowIOValueTypeEnum.boolean,
      value: false
    });
    const numberInput = makeInput({
      key: 'count',
      renderTypeList: [FlowNodeInputTypeEnum.numberInput],
      valueType: WorkflowIOValueTypeEnum.number,
      value: 0
    });

    expect(checkInputShouldRenderInDebug(booleanInput)).toBe(false);
    expect(checkInputShouldRenderInDebug(numberInput)).toBe(false);
  });

  it('should render empty array values as missing debug inputs', () => {
    const input = makeInput({
      key: 'query',
      renderTypeList: [FlowNodeInputTypeEnum.textarea],
      valueType: WorkflowIOValueTypeEnum.arrayString,
      value: []
    });

    expect(checkInputShouldRenderInDebug(input)).toBe(true);
  });

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
