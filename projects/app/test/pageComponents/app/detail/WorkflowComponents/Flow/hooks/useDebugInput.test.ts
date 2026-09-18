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
import { InputTypeEnum } from '@/components/core/app/formRender/constant';
import type { FileSelectorValueItemType } from '@/components/core/app/FileSelector/type';
import {
  checkInputShouldRenderInDebug,
  createDebugReadFilesSubmissionController,
  debugNodeShouldShowAllInputs,
  getDebugGlobalVariableFormProps,
  getDebugInputFormConfig,
  getDebugInputFormProps,
  getDebugInputFormValue,
  getDebugRuntimeInputs,
  getWorkflowStartDebugFileInput,
  getWorkflowStartDebugQuery,
  resolveDebugReadFilesInput
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

  it('should render the read files URL input as a local and URL file selector', () => {
    const input = makeInput({
      key: NodeInputKeyEnum.fileUrlList,
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.arrayString
    });

    expect(
      getDebugInputFormProps(input, {
        flowNodeType: FlowNodeTypeEnum.readFiles,
        maxFiles: 12
      })
    ).toMatchObject({
      renderTypeList: [FlowNodeInputTypeEnum.fileSelect],
      canSelectFile: true,
      canLocalUpload: true,
      canUrlUpload: true,
      maxFiles: 12
    });
  });

  it('should calculate the read files input type from transformed form props', () => {
    const input = makeInput({
      key: NodeInputKeyEnum.fileUrlList,
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.arrayString
    });

    expect(
      getDebugInputFormConfig(input, {
        flowNodeType: FlowNodeTypeEnum.readFiles,
        maxFiles: 12
      }).inputType
    ).toBe(InputTypeEnum.fileSelect);
  });

  it('should not change the same input key on another node type', () => {
    const input = makeInput({
      key: NodeInputKeyEnum.fileUrlList,
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.arrayString
    });

    expect(
      getDebugInputFormProps(input, {
        flowNodeType: FlowNodeTypeEnum.chatNode,
        maxFiles: 12
      })
    ).toMatchObject({
      renderTypeList: [FlowNodeInputTypeEnum.reference]
    });
  });

  it('should not change another input on the read files node', () => {
    const input = makeInput({
      key: 'otherInput',
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.arrayString
    });

    expect(
      getDebugInputFormProps(input, {
        flowNodeType: FlowNodeTypeEnum.readFiles,
        maxFiles: 12
      })
    ).toMatchObject({
      renderTypeList: [FlowNodeInputTypeEnum.reference]
    });
  });

  it('should preserve URL and local file order while resolving keys', async () => {
    const resolvedKeys: string[] = [];

    await expect(
      resolveDebugReadFilesInput({
        files: [
          {
            type: ChatFileTypeEnum.file,
            name: 'remote.pdf',
            url: 'https://example.com/remote.pdf'
          },
          {
            type: ChatFileTypeEnum.file,
            name: 'local.docx',
            key: 'local-docx-key'
          },
          {
            type: ChatFileTypeEnum.file,
            name: 'second.txt',
            key: 'second-text-key'
          }
        ],
        resolveFileKey: async (key) => {
          resolvedKeys.push(key);
          return `https://files.example.com/${key}`;
        }
      })
    ).resolves.toEqual([
      'https://example.com/remote.pdf',
      'https://files.example.com/local-docx-key',
      'https://files.example.com/second-text-key'
    ]);
    expect(resolvedKeys).toEqual(['local-docx-key', 'second-text-key']);
  });

  it('should reject the entire read files input when a key cannot be resolved', async () => {
    await expect(
      resolveDebugReadFilesInput({
        files: [
          {
            type: ChatFileTypeEnum.file,
            name: 'remote.pdf',
            url: 'https://example.com/remote.pdf'
          },
          {
            type: ChatFileTypeEnum.file,
            name: 'local.pdf',
            key: 'unauthorized-key'
          }
        ],
        resolveFileKey: async () => {
          throw new Error('Unauthorized file');
        }
      })
    ).rejects.toThrow('Unauthorized file');
  });

  it('should reject a malformed read files item without a URL or key', async () => {
    await expect(
      resolveDebugReadFilesInput({
        files: [
          {
            type: ChatFileTypeEnum.file,
            name: 'invalid.pdf'
          } as FileSelectorValueItemType
        ],
        resolveFileKey: async () => 'https://files.example.com/should-not-resolve'
      })
    ).rejects.toThrow('Invalid debug file');
  });

  it('should block duplicate read files submissions until the active one finishes', () => {
    const controller = createDebugReadFilesSubmissionController();
    const firstSubmission = controller.begin();

    expect(firstSubmission).toBeDefined();
    expect(controller.begin()).toBeUndefined();
    expect(controller.isCurrent(firstSubmission!)).toBe(true);
    expect(controller.finish(firstSubmission!)).toBe(true);
    expect(controller.begin()).toBeDefined();
  });

  it('should invalidate an old read files submission without finishing a new one', () => {
    const controller = createDebugReadFilesSubmissionController();
    const oldSubmission = controller.begin();
    controller.invalidate();
    const newSubmission = controller.begin();

    expect(oldSubmission).toBeDefined();
    expect(newSubmission).toBeDefined();
    expect(controller.isCurrent(oldSubmission!)).toBe(false);
    expect(controller.isCurrent(newSubmission!)).toBe(true);
    expect(controller.finish(oldSubmission!)).toBe(false);
    expect(controller.isCurrent(newSubmission!)).toBe(true);
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

  it('should replace only the runtime read files input without mutating the original reference', () => {
    const referenceValue = [['workflowStart', NodeOutputKeyEnum.userFiles]];
    const referenceInput = makeInput({
      key: NodeInputKeyEnum.fileUrlList,
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      selectedType: FlowNodeInputTypeEnum.reference,
      valueType: WorkflowIOValueTypeEnum.arrayString,
      value: referenceValue
    });

    const [runtimeInput] = getDebugRuntimeInputs({
      inputs: [referenceInput],
      nodeVariables: {
        [NodeInputKeyEnum.fileUrlList]: ['https://files.example.com/local.pdf']
      }
    });

    expect(runtimeInput.value).toEqual(['https://files.example.com/local.pdf']);
    expect(referenceInput.value).toBe(referenceValue);
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
