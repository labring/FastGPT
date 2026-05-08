import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { dispatchFormInput } from '@fastgpt/service/core/workflow/dispatch/interactive/formInput';

const { mockCreateGetChatFileURL } = vi.hoisted(() => ({
  mockCreateGetChatFileURL: vi.fn()
}));

vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  getS3ChatSource: () => ({
    createGetChatFileURL: mockCreateGetChatFileURL
  }),
  createChatFilePreviewUrlGetter:
    (options?: { expiredHours?: number; mode?: 'proxy' | 'presigned' }) => async (key: string) => {
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
    expect(result[DispatchNodeResponseKeyEnum.toolResponses]).toEqual({
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
});
