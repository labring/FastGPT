import { describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { ChatFileUploadSchema } from '@fastgpt/service/common/s3/sources/chat/type';

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

describe('ChatFileUploadSchema', () => {
  it('accepts workflow builder chat archives', () => {
    const result = ChatFileUploadSchema.safeParse({
      sourceType: ChatSourceTypeEnum.workflowBuilder,
      sourceId: '67f4c91c79a4d61b1f116b2a',
      chatId: 'chat-1',
      uId: 'user-1',
      filename: 'input.txt'
    });

    expect(result.success).toBe(true);
  });
});

describe('S3ChatSource.createGetChatFileURL', () => {
  it('reads S3 MIME metadata even when caller passes an extensionless display filename', async () => {
    const source = Object.create(S3ChatSource.prototype) as InstanceType<typeof S3ChatSource>;
    const fileId = '0123456789abcdef0123456789abcdef';
    const key = `chat/app/app-1/user-1/chat-1/file/${fileId}`;
    const createExternalUrl = vi.fn().mockResolvedValue({ url: 'https://files.test/signed.png' });
    const getFileMetadata = vi.fn().mockResolvedValue({
      filename: 'original-cover',
      extension: '',
      contentType: 'image/png',
      contentLength: 10
    });
    Object.assign(source, { createExternalUrl, getFileMetadata });

    await source.createGetChatFileURL({
      key,
      external: true,
      filename: 'cover'
    });

    expect(getFileMetadata).toHaveBeenCalledWith(key);
    expect(createExternalUrl).toHaveBeenCalledWith({
      key,
      expiredHours: 1,
      filename: 'cover',
      fallbackExtension: 'png'
    });
  });

  it('reads S3 MIME metadata for extensionless legacy non-opaque chat keys', async () => {
    const source = Object.create(S3ChatSource.prototype) as InstanceType<typeof S3ChatSource>;
    const key = 'chat/app/app-1/user-1/chat-1/legacy-cover';
    const createExternalUrl = vi.fn().mockResolvedValue({ url: 'https://files.test/signed.jpg' });
    const getFileMetadata = vi.fn().mockResolvedValue({
      filename: 'legacy-cover',
      extension: '',
      contentType: 'image/jpeg',
      contentLength: 10
    });
    Object.assign(source, { createExternalUrl, getFileMetadata });

    await source.createGetChatFileURL({
      key,
      external: true
    });

    expect(getFileMetadata).toHaveBeenCalledWith(key);
    expect(createExternalUrl).toHaveBeenCalledWith({
      key,
      expiredHours: 1,
      filename: 'legacy-cover',
      fallbackExtension: 'jpg'
    });
  });

  it('skips S3 metadata lookup when filename or key already provides a known extension, and degrades cleanly on metadata failure', async () => {
    const source = Object.create(S3ChatSource.prototype) as InstanceType<typeof S3ChatSource>;
    const createExternalUrl = vi.fn().mockResolvedValue({ url: 'https://files.test/signed' });
    const getFileMetadata = vi.fn().mockRejectedValue(new Error('s3 unavailable'));
    Object.assign(source, { createExternalUrl, getFileMetadata });

    await source.createGetChatFileURL({
      key: 'chat/app/app-1/user-1/chat-1/file/0123456789abcdef0123456789abcdef.png',
      external: true,
      filename: 'photo.png'
    });
    expect(getFileMetadata).not.toHaveBeenCalled();

    await source.createGetChatFileURL({
      key: 'chat/app/app-1/user-1/chat-1/legacy-cover',
      external: true,
      filename: 'cover'
    });
    expect(getFileMetadata).toHaveBeenCalledTimes(1);
    expect(createExternalUrl).toHaveBeenLastCalledWith({
      key: 'chat/app/app-1/user-1/chat-1/legacy-cover',
      expiredHours: 1,
      filename: 'cover'
    });
  });

  it('reuses SDK safe extension rules so bare extension names like png still fall back to S3 MIME metadata', async () => {
    const source = Object.create(S3ChatSource.prototype) as InstanceType<typeof S3ChatSource>;
    const fileId = '0123456789abcdef0123456789abcdef';
    const key = `chat/app/app-1/user-1/chat-1/file/${fileId}`;
    const createExternalUrl = vi.fn().mockResolvedValue({ url: 'https://files.test/signed.png' });
    const getFileMetadata = vi
      .fn()
      .mockResolvedValueOnce({
        filename: 'png',
        extension: '',
        contentType: 'image/png',
        contentLength: 10
      })
      .mockResolvedValueOnce({
        filename: 'png',
        extension: '',
        contentType: 'application/octet-stream',
        contentLength: 10
      })
      .mockResolvedValueOnce({
        filename: 'v1.2',
        extension: '',
        contentType: 'image/webp',
        contentLength: 10
      });
    Object.assign(source, { createExternalUrl, getFileMetadata });

    await source.createGetChatFileURL({
      key,
      external: true,
      filename: 'png'
    });
    expect(createExternalUrl).toHaveBeenNthCalledWith(1, {
      key,
      expiredHours: 1,
      filename: 'png',
      fallbackExtension: 'png'
    });

    // 元数据本身为无类型二进制且原文件名也无点后缀时，不把裸名 png 误当作 .png 后缀
    await source.createGetChatFileURL({
      key,
      external: true,
      filename: 'png'
    });
    expect(createExternalUrl).toHaveBeenNthCalledWith(2, {
      key,
      expiredHours: 1,
      filename: 'png'
    });

    // 纯数字后缀（如 v1.2）会被 SDK 忽略，仍应通过 S3 MIME 补齐扩展名
    await source.createGetChatFileURL({
      key,
      external: true,
      filename: 'v1.2'
    });
    expect(createExternalUrl).toHaveBeenNthCalledWith(3, {
      key,
      expiredHours: 1,
      filename: 'v1.2',
      fallbackExtension: 'webp'
    });
    expect(getFileMetadata).toHaveBeenCalledTimes(3);
  });
});
