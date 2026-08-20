import { describe, expect, it } from 'vitest';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '@fastgpt/global/core/workflow/node/constant';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { WorkflowReferenceSourceNode } from '@/web/core/workflow/utils';
import {
  checkInputShouldRenderInDebug,
  debugNodeShouldShowAllInputs,
  getDebugGlobalVariableFormProps,
  getDebugInputFormProps,
  getDebugInputFormValue,
  getDebugRuntimeInputs,
  getWorkflowStartDebugFileInput,
  getWorkflowStartDebugQuery
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
  it('should render all workflow start inputs', () => {
    expect(debugNodeShouldShowAllInputs(FlowNodeTypeEnum.workflowStart)).toBe(true);
  });

  it('should render all plugin input fields', () => {
    expect(debugNodeShouldShowAllInputs(FlowNodeTypeEnum.pluginInput)).toBe(true);
  });

  it('should keep filtering inputs for ordinary workflow nodes', () => {
    expect(debugNodeShouldShowAllInputs(FlowNodeTypeEnum.chatNode)).toBe(false);
  });

  it('should add a file selector for workflow start when app file input is enabled', () => {
    const input = getWorkflowStartDebugFileInput({
      flowNodeType: FlowNodeTypeEnum.workflowStart,
      fileSelectConfig: {
        canSelectFile: true,
        canSelectImg: true,
        maxFiles: 3
      }
    });

    expect(input).toMatchObject({
      key: NodeOutputKeyEnum.userFiles,
      renderTypeList: [FlowNodeInputTypeEnum.fileSelect],
      canLocalUpload: true,
      canUrlUpload: true,
      canSelectFile: true,
      canSelectImg: true,
      maxFiles: 3
    });
  });

  it('should not add a workflow start file selector when file input is disabled', () => {
    expect(
      getWorkflowStartDebugFileInput({
        flowNodeType: FlowNodeTypeEnum.workflowStart,
        fileSelectConfig: { canSelectFile: false, canSelectImg: false }
      })
    ).toBeUndefined();
  });

  it('should not add a workflow start file selector to ordinary nodes', () => {
    expect(
      getWorkflowStartDebugFileInput({
        flowNodeType: FlowNodeTypeEnum.chatNode,
        fileSelectConfig: { canSelectFile: true }
      })
    ).toBeUndefined();
  });

  it('should build workflow start query from text and selected files', () => {
    expect(
      getWorkflowStartDebugQuery({
        flowNodeType: FlowNodeTypeEnum.workflowStart,
        nodeVariables: {
          [NodeInputKeyEnum.userChatInput]: 'Summarize the files',
          [NodeOutputKeyEnum.userFiles]: [
            {
              type: ChatFileTypeEnum.file,
              name: 'draft.pdf',
              key: 'chat/app/team/user/debug-session/draft.pdf'
            },
            {
              type: ChatFileTypeEnum.image,
              name: 'public.png',
              url: 'https://example.com/public.png'
            }
          ]
        }
      })
    ).toEqual([
      {
        file: {
          type: ChatFileTypeEnum.file,
          name: 'draft.pdf',
          key: 'chat/app/team/user/debug-session/draft.pdf',
          url: ''
        }
      },
      {
        file: {
          type: ChatFileTypeEnum.image,
          name: 'public.png',
          url: 'https://example.com/public.png'
        }
      },
      {
        text: {
          content: 'Summarize the files'
        }
      }
    ]);
  });

  it('should return an empty query for workflow start without text or files', () => {
    expect(
      getWorkflowStartDebugQuery({
        flowNodeType: FlowNodeTypeEnum.workflowStart
      })
    ).toEqual([]);
  });

  it('should not create query for ordinary node debug', () => {
    expect(
      getWorkflowStartDebugQuery({
        flowNodeType: FlowNodeTypeEnum.chatNode,
        nodeVariables: {
          [NodeInputKeyEnum.userChatInput]: 'test'
        }
      })
    ).toBeUndefined();
  });

  it('should enable ordinary files for a legacy debug file variable', () => {
    expect(
      getDebugGlobalVariableFormProps({
        key: 'legacyFile',
        label: 'Legacy file',
        type: VariableInputEnum.file,
        description: '',
        required: false,
        valueType: WorkflowIOValueTypeEnum.arrayString,
        canLocalUpload: true
      })
    ).toMatchObject({
      canSelectFile: true,
      canLocalUpload: true
    });
  });

  it('should respect an explicitly disabled ordinary file type', () => {
    const variable = {
      key: 'imageOnly',
      label: 'Image only',
      type: VariableInputEnum.file,
      description: '',
      required: false,
      valueType: WorkflowIOValueTypeEnum.arrayString,
      canSelectFile: false,
      canLocalUpload: false,
      canSelectImg: true
    };

    expect(getDebugGlobalVariableFormProps(variable)).toBe(variable);
  });

  it('should keep non-file global variables unchanged', () => {
    const variable = {
      key: 'text',
      label: 'Text',
      type: VariableInputEnum.input,
      description: '',
      required: false,
      valueType: WorkflowIOValueTypeEnum.string
    };

    expect(getDebugGlobalVariableFormProps(variable)).toBe(variable);
  });

  it('should render reference inputs in node debug form', () => {
    const input = makeInput({
      key: 'userChatInput',
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
      selectedType: FlowNodeInputTypeEnum.reference,
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
      selectedType: FlowNodeInputTypeEnum.reference,
      value: [['source', 'text']]
    });

    expect(checkInputShouldRenderInDebug(input, validReferenceContext)).toBe(true);
  });

  it('should not render reference inputs without selected reference value', () => {
    const input = makeInput({
      key: 'userChatInput',
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
      selectedType: FlowNodeInputTypeEnum.reference,
      value: []
    });

    expect(checkInputShouldRenderInDebug(input, validReferenceContext)).toBe(false);
  });

  it('should not render reference inputs with incomplete reference value', () => {
    const input = makeInput({
      key: 'userChatInput',
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
      selectedType: FlowNodeInputTypeEnum.reference,
      value: [['workflowStart', '']]
    });

    expect(checkInputShouldRenderInDebug(input, validReferenceContext)).toBe(false);
  });

  it('should not render reference inputs when source node is missing', () => {
    const input = makeInput({
      key: 'userChatInput',
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
      selectedType: FlowNodeInputTypeEnum.reference,
      value: [['deletedNode', 'text']]
    });

    expect(checkInputShouldRenderInDebug(input, validReferenceContext)).toBe(false);
  });

  it('should not render reference inputs when source output is missing', () => {
    const input = makeInput({
      key: 'userChatInput',
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
      selectedType: FlowNodeInputTypeEnum.reference,
      value: [['source', 'deletedOutput']]
    });

    expect(checkInputShouldRenderInDebug(input, validReferenceContext)).toBe(false);
  });

  it('should not render reference inputs when source output type cannot be selected', () => {
    const input = makeInput({
      key: 'userChatInput',
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
      selectedType: FlowNodeInputTypeEnum.reference,
      valueType: WorkflowIOValueTypeEnum.number,
      value: [['source', 'text']]
    });

    expect(checkInputShouldRenderInDebug(input, validReferenceContext)).toBe(false);
  });

  it('should render agent generated inputs in node debug form', () => {
    const input = makeInput({
      key: 'query',
      renderTypeList: [FlowNodeInputTypeEnum.input, FlowNodeInputTypeEnum.agentGenerated],
      selectedType: FlowNodeInputTypeEnum.agentGenerated,
      value: undefined
    });

    expect(checkInputShouldRenderInDebug(input)).toBe(true);
  });

  it('should not render non-reference inputs in node debug form', () => {
    const input = makeInput({
      key: 'datasetSearchUsingExtensionQuery',
      renderTypeList: [FlowNodeInputTypeEnum.textarea],
      valueType: WorkflowIOValueTypeEnum.boolean,
      value: undefined
    });

    expect(checkInputShouldRenderInDebug(input)).toBe(false);
  });

  it('should render an ordinary input when the node shows all inputs', () => {
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
      selectedType: FlowNodeInputTypeEnum.reference,
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

    expect(checkInputShouldRenderInDebug(input)).toBe(false);
  });

  it('should not use reference value as node debug form default value', () => {
    const input = makeInput({
      key: 'userChatInput',
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.input],
      selectedType: FlowNodeInputTypeEnum.reference,
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

  it('should apply legacy file defaults to node debug form props', () => {
    const input = makeInput({
      renderTypeList: [FlowNodeInputTypeEnum.fileSelect],
      valueType: WorkflowIOValueTypeEnum.arrayString
    });

    expect(getDebugInputFormProps(input)).toMatchObject({
      canSelectFile: true,
      canLocalUpload: true
    });
  });

  it('should preserve explicit file restrictions in node debug form props', () => {
    const input = makeInput({
      renderTypeList: [FlowNodeInputTypeEnum.fileSelect],
      valueType: WorkflowIOValueTypeEnum.arrayString,
      canSelectFile: false,
      canLocalUpload: false,
      canSelectImg: true
    });

    expect(getDebugInputFormProps(input)).toMatchObject({
      canSelectFile: false,
      canLocalUpload: false,
      canSelectImg: true
    });
  });

  it('should not use default value as node debug form default value', () => {
    const input = makeInput({
      key: 'query',
      renderTypeList: [FlowNodeInputTypeEnum.input],
      defaultValue: 'default'
    });

    expect(getDebugInputFormValue(input)).toBeUndefined();
  });

  it('should keep file selector values as an array in debug form', () => {
    const files = [
      {
        type: ChatFileTypeEnum.file,
        name: 'draft.pdf',
        key: 'draft-key'
      }
    ];
    const input = makeInput({
      key: NodeOutputKeyEnum.userFiles,
      renderTypeList: [FlowNodeInputTypeEnum.fileSelect],
      valueType: WorkflowIOValueTypeEnum.arrayString,
      value: files
    });

    expect(getDebugInputFormValue(input)).toBe(files);
  });

  it('should clear old reference value when a rendered debug field is submitted empty', () => {
    const referenceInput = makeInput({
      key: 'userChatInput',
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.input],
      selectedType: FlowNodeInputTypeEnum.reference,
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
