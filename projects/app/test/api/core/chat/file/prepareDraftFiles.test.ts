import type { ApiRequestProps } from '@fastgpt/next/type';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), prepare: vi.fn() }));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@/service/support/permission/auth/chat', () => ({ authChatTargetCrud: mocks.auth }));
vi.mock('@/service/core/chat/file/draft', () => ({ prepareAuthorizedDraftFiles: mocks.prepare }));
import handler from '@/pages/api/core/chat/file/prepareDraftFiles';

const appId = '507f1f77bcf86cd799439011';
const chatId = 'chat';
const uid = 'member';
const key = `chat/app/${appId}/${uid}/${chatId}/file.pdf`;
const body = { appId, chatId, keys: [key], remainingMs: 3600000 };
const call = (input: Record<string, unknown>) =>
  (handler as unknown as (req: ApiRequestProps) => Promise<unknown>)({
    body: input
  } as ApiRequestProps);

describe('prepareDraftFiles API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ sourceType: ChatSourceTypeEnum.app, sourceId: appId, uid });
    mocks.prepare.mockResolvedValue([
      { key, status: 'ready', url: 'https://preview', expiresAt: 1791950000000 }
    ]);
  });

  it('validates input, authenticates the member and prepares only keys belonging to this chat', async () => {
    await expect(call(body)).resolves.toEqual([
      { key, status: 'ready', url: 'https://preview', expiresAt: 1791950000000 }
    ]);
    expect(mocks.auth).toHaveBeenCalledWith(
      expect.objectContaining({
        authToken: true,
        authApiKey: true,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appId,
        chatId
      })
    );
    expect(mocks.prepare).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      chatId,
      keys: [key],
      remainingMs: 3600000
    });
  });

  it.each([
    { remainingMs: 0 },
    { remainingMs: 3600001 },
    { keys: [] },
    { chatId: '' },
    { keys: Array.from({ length: 101 }, () => key) }
  ])('rejects invalid requests before authentication: %j', async (invalid) => {
    await expect(call({ ...body, ...invalid })).rejects.toBeDefined();
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it.each([
    `chat/app/${appId}/other/${chatId}/file.pdf`,
    `chat/app/${appId}/${uid}/other/file.pdf`,
    `chat/app/507f1f77bcf86cd799439012/${uid}/${chatId}/file.pdf`
  ])('rejects foreign keys without any partial renewal: %s', async (foreignKey) => {
    await expect(call({ ...body, keys: [key, foreignKey], tmbId: 'other' })).rejects.toBe(
      ChatErrEnum.unAuthChat
    );
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it('uses the resolved share identity and validates the business response', async () => {
    await call({
      chatId,
      keys: [key],
      remainingMs: 1000,
      outLinkAuthData: { shareId: 'share', outLinkUid: uid }
    });
    expect(mocks.auth).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: undefined,
        outLinkAuthData: { shareId: 'share', outLinkUid: uid }
      })
    );
    mocks.prepare.mockResolvedValueOnce([{ key, status: 'ready' }]);
    await expect(call(body)).rejects.toBeDefined();
  });
});
