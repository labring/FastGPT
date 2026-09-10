import { afterEach, describe, expect, it, vi } from 'vitest';

const { S3ChatSource } = await vi.importActual<
  typeof import('@fastgpt/service/common/s3/sources/chat')
>('@fastgpt/service/common/s3/sources/chat');

describe('S3ChatSource.parseChatUrl', () => {
  it('encodes each chat identity segment without changing its path structure', () => {
    expect(
      S3ChatSource.prototype.getToolFilePrefix({
        sourceType: 'app',
        sourceId: 'app-1',
        uId: 'user-1',
        chatId: 'cidJo/BfvcOoMYekj5GBYfwUw=='
      })
    ).toBe('chat/app/app-1/user-1/cidJo%2FBfvcOoMYekj5GBYfwUw%3D%3D');
  });

  it('decodes the display filename while preserving the canonical parsed image prefix', () => {
    const result = S3ChatSource.parseChatUrl(
      'https://example.com/fastgpt-private/chat/app/user/chat/report%20%28final%29.pdf'
    );

    expect(result).toEqual({
      filename: 'report (final).pdf',
      extension: 'pdf',
      imageParsePrefix: 'chat/app/user/chat/report%20%28final%29-parsed'
    });
  });

  it('only removes the trailing extension from the canonical pathname', () => {
    const result = S3ChatSource.parseChatUrl(
      'https://example.com/fastgpt-private/chat/app.pdf/user/chat/report.pdf'
    );

    expect(result.imageParsePrefix).toBe('chat/app.pdf/user/chat/report-parsed');
  });

  it('derives the parsed prefix from the opaque file id', () => {
    const fileId = '0123456789abcdef0123456789abcdef';
    const result = S3ChatSource.parseChatUrl(
      `https://example.com/fastgpt-private/chat/app/app-1/user-1/chat-1/file/${fileId}.pdf`
    );

    expect(result).toEqual({
      filename: `${fileId}.pdf`,
      extension: 'pdf',
      imageParsePrefix: `chat/app/app-1/user-1/chat-1/parsed/${fileId}`
    });
  });
});

const CHAT_FILE_KEY = 'chat/app/app-1/user-1/chat-1/tool-output.csv';

/** serviceEnv 在模块加载时取值，切换 FILE_URL_EXPIRED_HOURS 后必须重新加载模块；全局测试 mock 会替换 chat source，这里取真实实现。 */
const loadRealChatSource = async (expiredHours?: string) => {
  vi.resetModules();
  vi.stubEnv('FILE_URL_EXPIRED_HOURS', expiredHours);
  const chatSourceModule = await vi.importActual<
    typeof import('@fastgpt/service/common/s3/sources/chat')
  >('@fastgpt/service/common/s3/sources/chat');
  return chatSourceModule.S3ChatSource;
};

const createExternalUrlArgs = async (expiredHours?: string) => {
  const RealChatSource = await loadRealChatSource(expiredHours);
  const createExternalUrl = vi
    .spyOn(RealChatSource.prototype, 'createExternalUrl')
    .mockResolvedValue({ bucket: 'fastgpt-private', key: CHAT_FILE_KEY, url: 'https://files/x' });

  await new RealChatSource().createGetChatFileURL({ key: CHAT_FILE_KEY, external: true });

  return createExternalUrl.mock.calls[0]?.[0];
};

describe('S3ChatSource.createGetChatFileURL', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('signs chat and tool file links with the configured default lifetime', async () => {
    await expect(createExternalUrlArgs('2')).resolves.toMatchObject({
      key: CHAT_FILE_KEY,
      expiredHours: 2
    });
  });

  it('falls back to a one hour lifetime when FILE_URL_EXPIRED_HOURS is not configured', async () => {
    await expect(createExternalUrlArgs()).resolves.toMatchObject({
      key: CHAT_FILE_KEY,
      expiredHours: 1
    });
  });
});
