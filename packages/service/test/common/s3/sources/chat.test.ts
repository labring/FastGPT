import { describe, expect, it, vi } from 'vitest';

const { S3ChatSource } = await vi.importActual<
  typeof import('@fastgpt/service/common/s3/sources/chat')
>('@fastgpt/service/common/s3/sources/chat');

describe('S3ChatSource.parseChatUrl', () => {
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
});
