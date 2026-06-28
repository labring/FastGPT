import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authChatTargetCrud: vi.fn(),
  createGetChatFileURL: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@/service/support/permission/auth/chat', () => ({
  authChatTargetCrud: mocks.authChatTargetCrud
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

    mocks.authChatTargetCrud.mockResolvedValue({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      teamId: 'team-id',
      uid
    });
    mocks.createGetChatFileURL.mockResolvedValue({
      url: 'https://example.com/download-token'
    });
  });

  it('signs a legacy app chat file only when the key belongs to the authorized app and uid', async () => {
    await expect(
      callHandler({
        appId,
        chatId,
        key: `chat/${appId}/${uid}/${chatId}/demo.pdf`
      })
    ).resolves.toBe('https://example.com/download-token');

    expect(mocks.authChatTargetCrud).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appId,
        chatId,
        authToken: true,
        authApiKey: true
      })
    );
    expect(mocks.createGetChatFileURL).toHaveBeenCalledWith({
      key: `chat/${appId}/${uid}/${chatId}/demo.pdf`,
      external: true,
      mode: undefined
    });
  });

  it('signs a source-aware skill chat file', async () => {
    const skillId = '507f1f77bcf86cd799439012';
    mocks.authChatTargetCrud.mockResolvedValueOnce({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      teamId: 'team-id',
      uid
    });

    await expect(
      callHandler({
        skillId,
        chatId,
        key: `chat/${ChatSourceTypeEnum.skillEdit}/${skillId}/${uid}/${chatId}/demo.pdf`
      })
    ).resolves.toBe('https://example.com/download-token');

    expect(mocks.authChatTargetCrud).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId,
        chatId,
        authToken: true,
        authApiKey: true
      })
    );
    expect(mocks.createGetChatFileURL).toHaveBeenCalledWith({
      key: `chat/${ChatSourceTypeEnum.skillEdit}/${skillId}/${uid}/${chatId}/demo.pdf`,
      external: true,
      mode: undefined
    });
  });

  it('signs a shared chat file with source resolved by authChatTargetCrud', async () => {
    const resolvedAppId = '507f1f77bcf86cd799439099';
    mocks.authChatTargetCrud.mockResolvedValueOnce({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: resolvedAppId,
      teamId: 'team-id',
      uid
    });

    await expect(
      callHandler({
        chatId,
        key: `chat/${resolvedAppId}/${uid}/${chatId}/demo.pdf`,
        outLinkAuthData: {
          shareId: 'share-id',
          outLinkUid: uid
        }
      })
    ).resolves.toBe('https://example.com/download-token');

    expect(mocks.authChatTargetCrud).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: undefined,
        outLinkAuthData: {
          shareId: 'share-id',
          outLinkUid: uid
        },
        chatId,
        authToken: true,
        authApiKey: true
      })
    );
    expect(mocks.createGetChatFileURL).toHaveBeenCalledWith({
      key: `chat/${resolvedAppId}/${uid}/${chatId}/demo.pdf`,
      external: true,
      mode: undefined
    });
  });

  it('rejects a key from another app before signing', async () => {
    await expect(
      callHandler({
        appId,
        chatId,
        key: `chat/507f1f77bcf86cd799439099/${uid}/${chatId}/demo.pdf`
      })
    ).rejects.toBe(ChatErrEnum.unAuthChat);

    expect(mocks.createGetChatFileURL).not.toHaveBeenCalled();
  });

  it('rejects a key from another chat uid before signing', async () => {
    await expect(
      callHandler({
        appId,
        chatId,
        key: `chat/${appId}/victim-uid/${chatId}/demo.pdf`
      })
    ).rejects.toBe(ChatErrEnum.unAuthChat);

    expect(mocks.createGetChatFileURL).not.toHaveBeenCalled();
  });

  it('rejects a key from another chat id before signing', async () => {
    await expect(
      callHandler({
        appId,
        chatId,
        key: `chat/${appId}/${uid}/another-chat/demo.pdf`
      })
    ).rejects.toBe(ChatErrEnum.unAuthChat);

    expect(mocks.createGetChatFileURL).not.toHaveBeenCalled();
  });
});
