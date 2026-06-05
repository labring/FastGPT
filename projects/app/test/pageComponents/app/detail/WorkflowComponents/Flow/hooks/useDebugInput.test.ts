import { describe, expect, it } from 'vitest';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { WorkflowReferenceSourceNode } from '@/web/core/workflow/utils';
import {
  checkInputShouldRenderInDebug,
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

const validReferenceContext = {
  referenceSourceNodes: [
    {
      nodeId: 'source',
      outputs: [
        {
          id: 'text',
          key: 'text',
          label: 'Text',
          type: FlowNodeOutputTypeEnum.static,
          valueType: WorkflowIOValueTypeEnum.string
        }
      ]
    }
  ] satisfies WorkflowReferenceSourceNode[]
};

describe('useDebugInput', () => {
  it('should render reference inputs in node debug form', () => {
    const input = makeInput({
      key: 'userChatInput',
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
      selectedTypeIndex: 0,
      value: [['source', 'text']]
    });

    expect(checkInputShouldRenderInDebug(input, validReferenceContext)).toBe(true);
  });

  it('should render reference config inputs in node debug form', () => {
    const input = makeInput({
      key: 'datasetSelectList',
      renderTypeList: [
        FlowNodeInputTypeEnum.reference,
        FlowNodeInputTypeEnum.selectDatasetParamsModal
      ],
      selectedTypeIndex: 0,
      value: [['source', 'text']]
    });

    expect(checkInputShouldRenderInDebug(input, validReferenceContext)).toBe(true);
  });

  it('should not render reference inputs without selected reference value', () => {
    const input = makeInput({
      key: 'userChatInput',
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
      selectedTypeIndex: 0,
      value: []
    });

    expect(checkInputShouldRenderInDebug(input, validReferenceContext)).toBe(false);
  });

  it('should not render reference inputs with incomplete reference value', () => {
    const input = makeInput({
      key: 'userChatInput',
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
      selectedTypeIndex: 0,
      value: [['workflowStart', '']]
    });

    expect(checkInputShouldRenderInDebug(input, validReferenceContext)).toBe(false);
  });

  it('should not render reference inputs when source node is missing', () => {
    const input = makeInput({
      key: 'userChatInput',
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
      selectedTypeIndex: 0,
      value: [['deletedNode', 'text']]
    });

    expect(checkInputShouldRenderInDebug(input, validReferenceContext)).toBe(false);
  });

  it('should not render reference inputs when source output is missing', () => {
    const input = makeInput({
      key: 'userChatInput',
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
      selectedTypeIndex: 0,
      value: [['source', 'deletedOutput']]
    });

    expect(checkInputShouldRenderInDebug(input, validReferenceContext)).toBe(false);
  });

  it('should not render reference inputs when source output type cannot be selected', () => {
    const input = makeInput({
      key: 'userChatInput',
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
      selectedTypeIndex: 0,
      valueType: WorkflowIOValueTypeEnum.number,
      value: [['source', 'text']]
    });

    expect(checkInputShouldRenderInDebug(input, validReferenceContext)).toBe(false);
  });

  it('should not render non-reference inputs in node debug form', () => {
    const input = makeInput({
      key: 'datasetSearchUsingExtensionQuery',
      renderTypeList: [FlowNodeInputTypeEnum.textarea],
      valueType: WorkflowIOValueTypeEnum.boolean,
      value: undefined
    });

    expect(checkInputShouldRenderInDebug(input, validReferenceContext)).toBe(false);
  });

  it('should render all plugin input fields', () => {
    const input = makeInput({
      key: 'query',
      renderTypeList: [FlowNodeInputTypeEnum.textarea],
      valueType: WorkflowIOValueTypeEnum.string,
      value: 'fixed value'
    });

    expect(checkInputShouldRenderInDebug(input, { showAllInputs: true })).toBe(true);
  });

  it('should render plugin input reference fields even without selected reference value', () => {
    const input = makeInput({
      key: 'query',
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      selectedTypeIndex: 0,
      value: []
    });

    expect(checkInputShouldRenderInDebug(input, { showAllInputs: true })).toBe(true);
  });

  it('should not render default values as missing debug inputs', () => {
    const input = makeInput({
      key: 'query',
      renderTypeList: [FlowNodeInputTypeEnum.textarea],
      valueType: WorkflowIOValueTypeEnum.arrayString,
      defaultValue: ['default query']
    });

    expect(checkInputShouldRenderInDebug(input, validReferenceContext)).toBe(false);
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

  it('should not use default value as node debug form default value', () => {
    const input = makeInput({
      key: 'query',
      renderTypeList: [FlowNodeInputTypeEnum.input],
      defaultValue: 'default'
    });

    expect(getDebugInputFormValue(input)).toBeUndefined();
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
