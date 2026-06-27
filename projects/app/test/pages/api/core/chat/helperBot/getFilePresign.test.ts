import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authHelperBotChatCrud: vi.fn(),
  authFrequencyLimit: vi.fn(),
  createUploadFileURL: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@/service/support/permission/auth/chat', () => ({
  authHelperBotChatCrud: mocks.authHelperBotChatCrud
}));

vi.mock('@fastgpt/service/common/system/frequencyLimit/utils', () => ({
  authFrequencyLimit: mocks.authFrequencyLimit
}));

vi.mock('@fastgpt/service/common/s3/sources/helperbot/index', () => ({
  getS3HelperBotSource: () => ({
    createUploadFileURL: mocks.createUploadFileURL
  })
}));

import handler from '@/pages/api/core/chat/helperBot/getFilePresign';

const presignHandler = handler as unknown as (req: ApiRequestProps) => Promise<unknown>;

const callHandler = (body: Record<string, unknown>) =>
  presignHandler({
    body
  } as ApiRequestProps);

describe('helperBot/getFilePresign', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.authHelperBotChatCrud.mockResolvedValue({
      userId: 'user-1'
    });
    mocks.createUploadFileURL.mockResolvedValue({
      url: 'https://example.com/upload',
      key: 'helperBot/topAgent/user-1/chat-1/demo.pdf',
      headers: {},
      previewUrl: 'https://example.com/preview'
    });
  });

  it('validates body before creating upload URL', async () => {
    await expect(
      callHandler({
        type: 'topAgent',
        chatId: 'chat-1',
        filename: 'demo.pdf'
      })
    ).resolves.toEqual({
      url: 'https://example.com/upload',
      key: 'helperBot/topAgent/user-1/chat-1/demo.pdf',
      headers: {},
      previewUrl: 'https://example.com/preview'
    });

    expect(mocks.authHelperBotChatCrud).toHaveBeenCalledWith({
      type: 'topAgent',
      chatId: 'chat-1',
      req: expect.any(Object),
      authToken: true
    });
    expect(mocks.createUploadFileURL).toHaveBeenCalledWith({
      type: 'topAgent',
      chatId: 'chat-1',
      userId: 'user-1',
      filename: 'demo.pdf'
    });
  });

  it('rejects invalid body before auth or signing', async () => {
    await expect(callHandler({ type: 'topAgent', chatId: 'chat-1' })).rejects.toBeInstanceOf(
      ApiRequestInputParseError
    );

    expect(mocks.authHelperBotChatCrud).not.toHaveBeenCalled();
    expect(mocks.authFrequencyLimit).not.toHaveBeenCalled();
    expect(mocks.createUploadFileURL).not.toHaveBeenCalled();
  });
});
