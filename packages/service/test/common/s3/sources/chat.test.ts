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
  it('rejects workflow builder source because it is sandbox-only', () => {
    const result = ChatFileUploadSchema.safeParse({
      sourceType: ChatSourceTypeEnum.workflowBuilder,
      sourceId: '67f4c91c79a4d61b1f116b2a',
      chatId: 'chat-1',
      uId: 'user-1',
      filename: 'input.txt'
    });

    expect(result.success).toBe(false);
  });
});
