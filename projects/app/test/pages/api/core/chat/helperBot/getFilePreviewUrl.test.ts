import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authCert: vi.fn(),
  createGetFileURL: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: mocks.authCert
}));

vi.mock('@fastgpt/service/common/s3/sources/helperbot', () => ({
  getS3HelperBotSource: () => ({
    createGetFileURL: mocks.createGetFileURL
  })
}));

import handler from '@/pages/api/core/chat/helperBot/getFilePreviewUrl';

const previewHandler = handler as unknown as (req: ApiRequestProps) => Promise<string>;

const callHandler = (body: Record<string, unknown>) =>
  previewHandler({
    body
  } as ApiRequestProps);

describe('getFilePreviewUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.authCert.mockResolvedValue({
      userId: 'user-1'
    });
    mocks.createGetFileURL.mockResolvedValue({
      url: 'https://example.com/helper-bot-file'
    });
  });

  it('signs a helper bot file only when the key belongs to the current user', async () => {
    await expect(
      callHandler({
        key: 'helperBot/topAgent/user-1/chat-1/demo.pdf'
      })
    ).resolves.toBe('https://example.com/helper-bot-file');

    expect(mocks.createGetFileURL).toHaveBeenCalledWith({
      key: 'helperBot/topAgent/user-1/chat-1/demo.pdf',
      external: true,
      mode: undefined
    });
  });

  it('rejects a helper bot file key from another user', async () => {
    await expect(
      callHandler({
        key: 'helperBot/topAgent/user-2/chat-1/demo.pdf'
      })
    ).rejects.toBe(ChatErrEnum.unAuthChat);

    expect(mocks.createGetFileURL).not.toHaveBeenCalled();
  });

  it('rejects a malformed helper bot file key before signing', async () => {
    await expect(
      callHandler({
        key: 'topAgent/chat-1/user-1/demo.pdf'
      })
    ).rejects.toBe(ChatErrEnum.unAuthChat);

    expect(mocks.createGetFileURL).not.toHaveBeenCalled();
  });

  it('rejects invalid request body before auth or signing', async () => {
    await expect(callHandler({})).rejects.toBeInstanceOf(ApiRequestInputParseError);

    expect(mocks.authCert).not.toHaveBeenCalled();
    expect(mocks.createGetFileURL).not.toHaveBeenCalled();
  });
});
