import { describe, expect, it } from 'vitest';
import { detectFileEncoding } from '@fastgpt/global/common/file/tools';
import { readFileRawText } from '@fastgpt/service/worker/readFile/extension/rawText';

describe('encoding regression matrix', () => {
  it('should decode UTF-8 mixed content correctly', async () => {
    const text = `${'A'.repeat(2048)}\n\n这是 UTF-8 中文内容`;
    const buffer = Buffer.from(text, 'utf8');

    const encoding = detectFileEncoding(buffer);
    const result = await readFileRawText({
      buffer,
      extension: 'md',
      encoding: encoding || 'utf-8'
    });

    expect(encoding).toBe('utf-8');
    expect(result.rawText).toContain('这是 UTF-8 中文内容');
  });

  it('should keep ASCII content unchanged when encoding is ascii', async () => {
    const text = 'Hello ASCII 123';
    const buffer = Buffer.from(text, 'ascii');

    const result = await readFileRawText({ buffer, extension: 'txt', encoding: 'ascii' });

    expect(result.rawText).toBe(text);
  });

  it('should fallback to utf-8 decoding when encoding is ascii but bytes are non-ascii', async () => {
    const text = '中文内容';
    const buffer = Buffer.from(text, 'utf8');

    const result = await readFileRawText({ buffer, extension: 'md', encoding: 'ascii' });

    expect(result.rawText).toContain('中文内容');
  });

  it('should not treat invalid utf-8 byte sequence as utf-8', () => {
    // Windows-1252 smart quote bytes, invalid in standalone UTF-8 sequence
    const invalidUtf8Buffer = Buffer.from([0x93, 0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x94]);

    const encoding = detectFileEncoding(invalidUtf8Buffer);

    expect(encoding).not.toBe('utf-8');
  });
});
