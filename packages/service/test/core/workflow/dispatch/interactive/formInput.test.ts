import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { dispatchFormInput } from '@fastgpt/service/core/workflow/dispatch/interactive/formInput';
import { runWithContext } from '@fastgpt/service/core/workflow/utils/context';

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
});
