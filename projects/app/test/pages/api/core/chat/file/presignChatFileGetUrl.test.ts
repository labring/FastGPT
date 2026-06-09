import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authChatCrud: vi.fn(),
  createGetChatFileURL: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@/service/support/permission/auth/chat', () => ({
  authChatCrud: mocks.authChatCrud
}));

vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  getS3ChatSource: () => ({
    createGetChatFileURL: mocks.createGetChatFileURL
  })
}));

import handler from '@/pages/api/core/chat/file/presignChatFileGetUrl';

const appId = '507f1f77bcf86cd799439011';
const uid = 'user-id';
const chatId = 'chat-id';
const presignHandler = handler as unknown as (req: ApiRequestProps) => Promise<string>;

const callHandler = (body: Record<string, unknown>) =>
  presignHandler({
    body
  } as ApiRequestProps);

describe('presignChatFileGetUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.authChatCrud.mockResolvedValue({
      teamId: 'team-id',
      uid
    });
    mocks.createGetChatFileURL.mockResolvedValue({
      url: 'https://example.com/download-token'
    });
  });

  it('signs a chat file only when the key belongs to the authorized app and uid', async () => {
    await expect(
      callHandler({
        appId,
        key: `chat/${appId}/${uid}/${chatId}/demo.pdf`
      })
    ).resolves.toBe('https://example.com/download-token');

    expect(mocks.createGetChatFileURL).toHaveBeenCalledWith({
      key: `chat/${appId}/${uid}/${chatId}/demo.pdf`,
      external: true,
      mode: undefined
    });
  });

  it('rejects a key from another app before signing', async () => {
    await expect(
      callHandler({
        appId,
        key: `chat/507f1f77bcf86cd799439099/${uid}/${chatId}/demo.pdf`
      })
    ).rejects.toBe(ChatErrEnum.unAuthChat);

    expect(mocks.createGetChatFileURL).not.toHaveBeenCalled();
  });

  it('rejects a key from another chat uid before signing', async () => {
    await expect(
      callHandler({
        appId,
        key: `chat/${appId}/victim-uid/${chatId}/demo.pdf`
      })
    ).rejects.toBe(ChatErrEnum.unAuthChat);

    expect(mocks.createGetChatFileURL).not.toHaveBeenCalled();
  });
});
