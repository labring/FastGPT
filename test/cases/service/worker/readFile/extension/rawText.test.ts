import { describe, expect, it } from 'vitest';
import { readFileRawText } from '@fastgpt/service/worker/readFile/extension/rawText';
import { detectFileEncoding } from '@fastgpt/global/common/file/tools';

describe('readFileRawText', () => {
  it('should decode ascii content with ascii encoding', async () => {
    const text = 'Hello ASCII 123';
    const buffer = Buffer.from(text, 'ascii');

    const result = await readFileRawText({
      extension: 'txt',
      buffer,
      encoding: 'ascii'
    });

    expect(result.rawText).toBe(text);
  });

  it('should normalize uppercase encoding name', async () => {
    const text = 'Hello ASCII 123';
    const buffer = Buffer.from(text, 'ascii');

    const result = await readFileRawText({
      extension: 'txt',
      buffer,
      encoding: 'ASCII'
    });

    expect(result.rawText).toBe(text);
  });

  it('should fallback to utf-8 when encoding is ascii but bytes are non-ascii', async () => {
    const text = '中文内容';
    const buffer = Buffer.from(text, 'utf8');

    const result = await readFileRawText({
      extension: 'md',
      buffer,
      encoding: 'ascii'
    });

    expect(result.rawText).toContain('中文内容');
  });

  it('should decode utf-8 content when encoding is empty', async () => {
    const text = 'UTF-8 文本';
    const buffer = Buffer.from(text, 'utf8');

    const result = await readFileRawText({
      extension: 'txt',
      buffer,
      encoding: ''
    });

    expect(result.rawText).toBe(text);
  });

  it('should fallback to utf-8 when iconv throws on invalid encoding name', async () => {
    const text = 'fallback 文本';
    const buffer = Buffer.from(text, 'utf8');

    const result = await readFileRawText({
      extension: 'txt',
      buffer,
      encoding: 'invalid-encoding-name'
    });

    expect(result.rawText).toBe(text);
  });

  it('should keep chinese readable in detect-and-decode pipeline', async () => {
    const text = `${'A'.repeat(2048)}\n\n这是 UTF-8 中文内容`;
    const buffer = Buffer.from(text, 'utf8');
    const encoding = detectFileEncoding(buffer) || 'utf-8';

    const result = await readFileRawText({
      extension: 'md',
      buffer,
      encoding
    });

    expect(encoding).toBe('utf-8');
    expect(result.rawText).toContain('这是 UTF-8 中文内容');
  });
});
