import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { dispatchPluginInput } from '@fastgpt/service/core/workflow/dispatch/plugin/runInput';

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

describe('dispatchPluginInput', () => {
  beforeEach(() => {
    mockCreateGetChatFileURL.mockReset();
  });

  it('presigns key-only file params before exposing plugin inputs', async () => {
    mockCreateGetChatFileURL.mockResolvedValueOnce({
      url: 'https://preview.example.com/doc.pdf'
    });

    const result = await dispatchPluginInput({
      params: {
        upload: [
          {
            type: ChatFileTypeEnum.file,
            key: 'chat/files/doc.pdf',
            name: 'doc.pdf'
          },
          {
            type: ChatFileTypeEnum.image,
            key: 'chat/files/image.png',
            name: 'image.png',
            url: 'https://existing.example.com/image.png'
          }
        ]
      },
      query: []
    } as any);

    expect(result.data?.upload).toEqual([
      'https://preview.example.com/doc.pdf',
      'https://existing.example.com/image.png'
    ]);
    expect(result.data?.[NodeOutputKeyEnum.userFiles]).toEqual([]);
    expect(result[DispatchNodeResponseKeyEnum.nodeResponse]).toEqual({});
    expect(mockCreateGetChatFileURL).toHaveBeenCalledWith({
      key: 'chat/files/doc.pdf',
      external: true,
      expiredHours: 1
    });
  });

  it('keeps plugin-called string url arrays unchanged', async () => {
    const result = await dispatchPluginInput({
      params: {
        upload: ['https://external.example.com/doc.pdf']
      },
      query: []
    } as any);

    expect(result.data?.upload).toEqual(['https://external.example.com/doc.pdf']);
    expect(mockCreateGetChatFileURL).not.toHaveBeenCalled();
  });

  it('keeps legacy userFiles from top-level query files', async () => {
    const result = await dispatchPluginInput({
      params: {},
      query: [
        {
          file: {
            type: ChatFileTypeEnum.file,
            name: 'top.pdf',
            url: 'https://query.example.com/top.pdf'
          }
        },
        {
          text: {
            content: 'ignored'
          }
        }
      ]
    } as any);

    expect(result.data?.[NodeOutputKeyEnum.userFiles]).toEqual([
      'https://query.example.com/top.pdf'
    ]);
  });
});
