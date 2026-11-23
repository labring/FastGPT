import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { createTestVariableContext, createTestWorkflowDispatch } from '../context/fixtures';
import { dispatchFormInput as dispatchFormInputWithoutContext } from '@fastgpt/service/core/workflow/dispatch/interactive/formInput';
import { runWithTestWorkflowContext as runWithContext } from '@fastgpt/service/test/core/workflow/dispatch/context/fixtures';
import {
  UserInputInteractiveSchema,
  type UserInputFormItemType
} from '@fastgpt/global/core/workflow/template/system/interactive/type';

const { mockCreateGetChatFileURL } = vi.hoisted(() => ({
  mockCreateGetChatFileURL: vi.fn()
}));

type MockCreatePreviewOptions = {
  expiredHours?: number;
};

vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  getS3ChatSource: () => ({
    createGetChatFileURL: mockCreateGetChatFileURL
  }),
  createChatFilePreviewUrlGetter: (options?: MockCreatePreviewOptions) => async (key: string) => {
    const { url } = await mockCreateGetChatFileURL({
      key,
      external: true,
      ...options
    });
    return url;
  }
}));

const dispatchFormInput = createTestWorkflowDispatch(dispatchFormInputWithoutContext);

describe('dispatchFormInput', () => {
  beforeEach(() => {
    mockCreateGetChatFileURL.mockReset();
  });

  it('opens a JSON-persisted form without a current value and resumes with the submitted value', async () => {
    const params = JSON.parse(
      JSON.stringify({
        description: 'Fill form',
        userInputForms: [
          {
            type: FlowNodeInputTypeEnum.input,
            key: 'name',
            label: 'Name',
            value: undefined,
            valueType: WorkflowIOValueTypeEnum.string,
            required: false,
            defaultValue: 'Alice'
          }
        ]
      })
    );
    const props = {
      histories: [],
      runtimeNodesMap: new Map(),
      node: { isEntry: false },
      params,
      query: []
    };
    const first = await dispatchFormInput(props as any);
    const interactive = UserInputInteractiveSchema.parse(
      JSON.parse(JSON.stringify(first[DispatchNodeResponseKeyEnum.interactive]))
    );
    expect(interactive.params.inputForm[0]).toMatchObject({ key: 'name', defaultValue: 'Alice' });
    expect(interactive.params.inputForm[0]).not.toHaveProperty('value');

    const resumed = await dispatchFormInput({
      ...props,
      node: { isEntry: true },
      lastInteractive: interactive,
      query: [{ text: { content: JSON.stringify({ name: 'Bob' }) } }]
    } as any);
    expect(resumed.data).toEqual({
      name: 'Bob',
      [NodeOutputKeyEnum.formInputResult]: { name: 'Bob' }
    });
    expect(params.userInputForms[0]).toEqual(interactive.params.inputForm[0]);
  });

  /** 用全局变量模拟动态选项来源，保留真实选项解析与交互生成逻辑。 */
  const dispatchOptionForm = ({
    type = FlowNodeInputTypeEnum.select,
    sourceValue,
    listReference = [[VARIABLE_NODE_ID, 'cities']],
    required = true
  }: {
    type?: FlowNodeInputTypeEnum;
    sourceValue: unknown;
    listReference?: unknown;
    required?: boolean;
  }) => {
    const formItem = {
      key: 'city',
      label: '城市',
      type,
      value: '',
      valueType: WorkflowIOValueTypeEnum.string,
      required,
      defaultValue: 'LegacyDefault',
      listInputType: FlowNodeInputTypeEnum.reference,
      listReference
    } satisfies Omit<UserInputFormItemType, 'listReference'> & { listReference: unknown };

    return dispatchFormInput({
      histories: [],
      node: { nodeId: 'form', isEntry: false },
      params: { description: 'Fill form', userInputForms: [formItem] },
      chatConfig: {
        variables: [
          {
            key: 'cities',
            label: 'Cities',
            description: '',
            type: VariableInputEnum.custom,
            valueType: WorkflowIOValueTypeEnum.arrayString
          }
        ]
      },
      runtimeEdges: [{ source: 'upstream', target: 'form' }],
      runtimeNodesMap: new Map([
        [
          'upstream',
          {
            nodeId: 'upstream',
            outputs: [{ id: 'bools', valueType: 'arrayBoolean', value: [true, false] }]
          }
        ]
      ]),
      variableContext: createTestVariableContext({
        cities: sourceValue,
        deletedCity: 'Stale city'
      }),
      query: []
    } as any);
  };

  it.each([
    { shape: 'list', listReference: [[VARIABLE_NODE_ID, 'cities']] },
    { shape: 'legacy single tuple', listReference: [VARIABLE_NODE_ID, 'cities'] },
    { shape: 'partly malformed list', listReference: [['stale'], [VARIABLE_NODE_ID, 'cities']] }
  ])(
    'resolves a $shape into form options with a persistable interactive result',
    async ({ listReference }) => {
      const result = await dispatchOptionForm({
        sourceValue: ['  Beijing  ', '   ', '', 'Shanghai'],
        listReference
      });
      const interactive = result[DispatchNodeResponseKeyEnum.interactive];
      if (interactive?.type !== 'userInput') throw new Error('Expected a user input interaction');
      expect(interactive.params.inputForm[0].defaultValue).toBeUndefined();
      const saved = UserInputInteractiveSchema.parse(JSON.parse(JSON.stringify(interactive)));
      expect(saved.params.description).toBe('Fill form');
      expect(saved.params.inputForm[0]).toMatchObject({
        listReference: [[VARIABLE_NODE_ID, 'cities']],
        list: ['Beijing', 'Shanghai'].map((city) => ({ label: city, value: city }))
      });
    }
  );

  it('ignores a deleted global with an injected value and disallowed referenced outputs', async () => {
    const result = await dispatchOptionForm({
      sourceValue: ['Beijing'],
      listReference: [
        [VARIABLE_NODE_ID, 'deletedCity'],
        ['upstream', 'bools'],
        [VARIABLE_NODE_ID, 'cities']
      ]
    });
    const interactive = UserInputInteractiveSchema.parse(
      result[DispatchNodeResponseKeyEnum.interactive]
    );
    expect(interactive.params.inputForm[0].list).toEqual([{ label: 'Beijing', value: 'Beijing' }]);
  });

  it.each([
    { type: FlowNodeInputTypeEnum.select, required: true, sourceValue: [] },
    { type: FlowNodeInputTypeEnum.multipleSelect, required: false, sourceValue: [] },
    { type: FlowNodeInputTypeEnum.select, required: true, sourceValue: ['   ', '\n\t'] }
  ])(
    'returns a business failure for empty dynamic $type options (required: $required)',
    async (props) => {
      await expect(dispatchOptionForm(props)).resolves.toEqual({
        error: { [NodeOutputKeyEnum.errorText]: 'workflow:form_input_no_available_options' },
        responseData: { errorText: 'workflow:form_input_no_available_options' }
      });
    }
  );

  it('presigns key-only fileSelect values before exposing form outputs', async () => {
    mockCreateGetChatFileURL.mockResolvedValueOnce({
      url: 'https://preview.example.com/upload.png'
    });

    const { fileContext } = await prepareWorkflowFileContext({
      query: [],
      histories: [],
      maxFileAmount: 5,
      scope: {
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app-1',
        uid: 'user-1',
        chatId: 'chat-1'
      }
    });
    const result = await runWithContext(
      { checkIsStopping: () => false, mcpClientMemory: {}, fileContext },
      () =>
        dispatchFormInput({
          histories: [{ obj: 'Human', value: [] }],
          node: { isEntry: true },
          params: {
            [NodeInputKeyEnum.description]: 'upload',
            [NodeInputKeyEnum.userInputForms]: [
              {
                key: 'upload',
                label: 'upload',
                type: FlowNodeInputTypeEnum.fileSelect,
                value: [],
                valueType: WorkflowIOValueTypeEnum.arrayString,
                required: false
              }
            ]
          },
          query: [
            {
              text: {
                content: JSON.stringify({
                  upload: [
                    { key: 'chat/app/app-1/user-1/chat-1/upload.png', name: 'upload.png' },
                    { url: 'https://external.example.com/file.pdf' },
                    'https://legacy.example.com/file.txt'
                  ]
                })
              }
            }
          ],
          lastInteractive: { type: 'userInput' }
        } as any)
    );

    expect(result.data?.upload).toEqual([
      'https://preview.example.com/upload.png',
      'https://external.example.com/file.pdf',
      'https://legacy.example.com/file.txt'
    ]);
    expect(result.data?.[NodeOutputKeyEnum.formInputResult]).toEqual({
      upload: [
        'https://preview.example.com/upload.png',
        'https://external.example.com/file.pdf',
        'https://legacy.example.com/file.txt'
      ]
    });
    expect(result[DispatchNodeResponseKeyEnum.toolResponse]).toEqual({
      upload: [
        'https://preview.example.com/upload.png',
        'https://external.example.com/file.pdf',
        'https://legacy.example.com/file.txt'
      ]
    });
    expect(mockCreateGetChatFileURL).toHaveBeenCalledWith({
      key: 'chat/app/app-1/user-1/chat-1/upload.png',
      external: true,
      expiredHours: 2
    });
  });

  it('registers key and external fileSelect values in the workflow file context', async () => {
    const registerInputFile = vi.fn(async ({ file }) => ({
      modelUrl:
        'key' in file
          ? `https://preview.example.com/${file.key}`
          : `https://registered.example.com/${file.name}`
    }));

    const result = await runWithContext(
      {
        checkIsStopping: () => false,
        mcpClientMemory: {},
        fileContext: {
          limits: { maxFileAmount: 5, maxBytesPerFile: 1024 },
          register: registerInputFile
        } as any
      },
      () =>
        dispatchFormInput({
          histories: [{ obj: 'Human', value: [] }],
          node: { isEntry: true },
          params: {
            [NodeInputKeyEnum.description]: 'upload',
            [NodeInputKeyEnum.userInputForms]: [
              {
                key: 'upload',
                label: 'upload',
                type: FlowNodeInputTypeEnum.fileSelect,
                value: [],
                valueType: WorkflowIOValueTypeEnum.arrayString,
                required: false
              }
            ]
          },
          query: [
            {
              text: {
                content: JSON.stringify({
                  upload: [
                    { key: 'chat/app/app-1/user-1/chat-1/upload.png' },
                    { url: 'https://external.example.com/report.pdf', name: 'report.pdf' }
                  ]
                })
              }
            }
          ],
          lastInteractive: { type: 'userInput' }
        } as any)
    );

    expect(result.data?.upload).toEqual([
      'https://preview.example.com/chat/app/app-1/user-1/chat-1/upload.png',
      'https://registered.example.com/report.pdf'
    ]);
    expect(registerInputFile).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        source: 'interactive',
        file: expect.objectContaining({ key: expect.any(String) })
      })
    );
    expect(registerInputFile).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        source: 'interactive',
        file: expect.objectContaining({ url: expect.any(String) })
      })
    );
    expect(mockCreateGetChatFileURL).not.toHaveBeenCalled();
  });

  it('silently slices fileSelect values by the form maxFiles limit', async () => {
    const registerInputFile = vi.fn(async ({ file }) => ({
      modelUrl: 'url' in file ? file.url : undefined
    }));

    const result = await runWithContext(
      {
        checkIsStopping: () => false,
        mcpClientMemory: {},
        fileContext: {
          limits: { maxFileAmount: 5, maxBytesPerFile: 1024 },
          register: registerInputFile
        } as any
      },
      () =>
        dispatchFormInput({
          histories: [{ obj: 'Human', value: [] }],
          node: { isEntry: true },
          params: {
            [NodeInputKeyEnum.description]: 'upload',
            [NodeInputKeyEnum.userInputForms]: [
              {
                key: 'upload',
                label: 'upload',
                type: FlowNodeInputTypeEnum.fileSelect,
                value: [],
                valueType: WorkflowIOValueTypeEnum.arrayString,
                required: false,
                maxFiles: 2
              }
            ]
          },
          query: [
            {
              text: {
                content: JSON.stringify({
                  upload: [
                    'https://external.example.com/1.pdf',
                    'https://external.example.com/2.pdf',
                    'https://external.example.com/3.pdf'
                  ]
                })
              }
            }
          ],
          lastInteractive: { type: 'userInput' }
        } as any)
    );

    expect(result.data?.upload).toEqual([
      'https://external.example.com/1.pdf',
      'https://external.example.com/2.pdf'
    ]);
    expect(registerInputFile).toHaveBeenCalledTimes(2);
  });

  it('caps the form maxFiles limit by the workflow user quota', async () => {
    const registerInputFile = vi.fn(async ({ file }) => ({
      modelUrl: 'url' in file ? file.url : undefined
    }));

    const result = await runWithContext(
      {
        checkIsStopping: () => false,
        mcpClientMemory: {},
        fileContext: {
          limits: { maxFileAmount: 1, maxBytesPerFile: 1024 },
          register: registerInputFile
        } as any
      },
      () =>
        dispatchFormInput({
          histories: [{ obj: 'Human', value: [] }],
          node: { isEntry: true },
          params: {
            [NodeInputKeyEnum.description]: 'upload',
            [NodeInputKeyEnum.userInputForms]: [
              {
                key: 'upload',
                label: 'upload',
                type: FlowNodeInputTypeEnum.fileSelect,
                value: [],
                valueType: WorkflowIOValueTypeEnum.arrayString,
                required: false,
                maxFiles: 2
              }
            ]
          },
          query: [
            {
              text: {
                content: JSON.stringify({
                  upload: [
                    'https://external.example.com/1.pdf',
                    'https://external.example.com/2.pdf'
                  ]
                })
              }
            }
          ],
          lastInteractive: { type: 'userInput' }
        } as any)
    );

    expect(result.data?.upload).toEqual(['https://external.example.com/1.pdf']);
    expect(registerInputFile).toHaveBeenCalledTimes(1);
  });

  it('blocks the node when formItem description or value violates output moderation', async () => {
    const outputMod = await import('@fastgpt/service/core/plugin/moderation/output');
    const spy = vi
      .spyOn(outputMod, 'checkOutputTextModeration')
      .mockImplementation(async ({ text, targetField }) => {
        if (text === 'toxic-desc' || text === 'toxic-val') {
          return {
            isPass: false,
            action: 'block' as any,
            text,
            blockErrorMessage: `blocked: ${targetField}`
          };
        }
        return { isPass: true, action: 'pass' as any, text };
      });

    // Case 1: toxic description in formItem
    const resultWithToxicDesc = await dispatchFormInput({
      histories: [{ obj: 'Human', value: [] }],
      node: { isEntry: true },
      params: {
        [NodeInputKeyEnum.description]: 'normal description',
        [NodeInputKeyEnum.userInputForms]: [
          {
            key: 'input1',
            label: 'normal label',
            description: 'toxic-desc',
            type: FlowNodeInputTypeEnum.input,
            valueType: WorkflowIOValueTypeEnum.string,
            required: false
          }
        ]
      }
    } as any);
    expect(resultWithToxicDesc.error?.[NodeOutputKeyEnum.errorText]).toBe(
      'blocked: formInput.input1.description'
    );
    expect(resultWithToxicDesc[DispatchNodeResponseKeyEnum.interactive]).toBeUndefined();

    // Case 2: toxic value in formItem
    const resultWithToxicVal = await dispatchFormInput({
      histories: [{ obj: 'Human', value: [] }],
      node: { isEntry: true },
      params: {
        [NodeInputKeyEnum.description]: 'normal description',
        [NodeInputKeyEnum.userInputForms]: [
          {
            key: 'input2',
            label: 'normal label',
            value: 'toxic-val',
            type: FlowNodeInputTypeEnum.input,
            valueType: WorkflowIOValueTypeEnum.string,
            required: false
          }
        ]
      }
    } as any);
    expect(resultWithToxicVal.error?.[NodeOutputKeyEnum.errorText]).toBe(
      'blocked: formInput.input2.value'
    );
    expect(resultWithToxicVal[DispatchNodeResponseKeyEnum.interactive]).toBeUndefined();

    spy.mockRestore();
  });
});

import { prepareWorkflowFileContext } from '@fastgpt/service/core/workflow/dispatch/context/file';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
