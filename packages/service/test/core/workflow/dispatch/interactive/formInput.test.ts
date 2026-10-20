import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { dispatchFormInput } from '@fastgpt/service/core/workflow/dispatch/interactive/formInput';
import { runWithContext } from '@fastgpt/service/core/workflow/utils/context';
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
    required = true
  }: {
    type?: FlowNodeInputTypeEnum;
    sourceValue: unknown;
    required?: boolean;
  }) => {
    const formItem: UserInputFormItemType = {
      key: 'city',
      label: '城市',
      type,
      value: '',
      valueType: WorkflowIOValueTypeEnum.string,
      required,
      defaultValue: 'LegacyDefault',
      listInputType: FlowNodeInputTypeEnum.reference,
      listReference: [[VARIABLE_NODE_ID, 'cities']]
    };

    return dispatchFormInput({
      histories: [],
      node: { isEntry: false },
      params: { description: 'Fill form', userInputForms: [formItem] },
      variableState: { toRuntimeRecord: () => ({ cities: sourceValue }) },
      query: []
    } as any);
  };

  it('resolves dynamic options, trims whitespace, and removes the static default', async () => {
    const result = await dispatchOptionForm({
      sourceValue: ['  Beijing  ', '   ', '', 'Shanghai']
    });
    expect(result[DispatchNodeResponseKeyEnum.interactive]).toEqual({
      type: 'userInput',
      params: {
        description: 'Fill form',
        inputForm: [
          expect.objectContaining({
            defaultValue: undefined,
            list: [
              { label: 'Beijing', value: 'Beijing' },
              { label: 'Shanghai', value: 'Shanghai' }
            ]
          })
        ]
      }
    });
  });

  it.each([
    { type: FlowNodeInputTypeEnum.select, required: true, sourceValue: [] },
    { type: FlowNodeInputTypeEnum.multipleSelect, required: false, sourceValue: [] },
    { type: FlowNodeInputTypeEnum.select, required: true, sourceValue: ['   ', '\n\t'] }
  ])('rejects empty dynamic $type options (required: $required)', async (props) => {
    await expect(dispatchOptionForm(props)).rejects.toThrow(
      'workflow:form_input_no_available_options'
    );
  });

  it('presigns key-only fileSelect values before exposing form outputs', async () => {
    mockCreateGetChatFileURL.mockResolvedValueOnce({
      url: 'https://preview.example.com/upload.png'
    });

    const result = await dispatchFormInput({
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
                { key: 'chat/files/upload.png', name: 'upload.png' },
                { url: 'https://external.example.com/file.pdf' },
                'https://legacy.example.com/file.txt'
              ]
            })
          }
        }
      ],
      lastInteractive: { type: 'userInput' }
    } as any);

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
      key: 'chat/files/upload.png',
      external: true,
      expiredHours: 1
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
        mcpClientMemory: {},
        fileRegistrar: { registerInputFile } as any
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
        mcpClientMemory: {},
        fileRegistrar: { registerInputFile } as any
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
        mcpClientMemory: {},
        fileContext: { limits: { maxFileAmount: 1 } } as any,
        fileRegistrar: { registerInputFile } as any
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
});
