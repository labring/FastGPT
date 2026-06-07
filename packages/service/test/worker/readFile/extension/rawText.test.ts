import { describe, expect, it, vi } from 'vitest';
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

describe('readFileRawText performance', () => {
  // 解码是 CPU 密集型操作，阈值按中等机器保守设置，CI 慢时可放宽
  const PERFORMANCE_THRESHOLDS = {
    largeUtf8Text: 500, // ~5MB UTF-8 文本纯解码
    manyBase64Images: 1500 // 200 张 base64 图片的 markdown 正则抽取
  };

  it('should decode ~5MB utf-8 text within threshold', async () => {
    const line = '这是一段 UTF-8 中文文本，用于性能压测。\n';
    const text = line.repeat(150_000);
    const buffer = Buffer.from(text, 'utf8');

    const start = performance.now();
    const result = await readFileRawText({
      extension: 'txt',
      buffer,
      encoding: 'utf-8'
    });
    const duration = performance.now() - start;

    expect(result.rawText.length).toBe(text.trim().length);
    expect(result).not.toHaveProperty('imageList');
    expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.largeUtf8Text);
  });

  it('should upload base64 images in worker and replace markdown image src with key', async () => {
    const base64Data =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const content = `段落\n\n![alt](data:image/png;base64,${base64Data})\n`;
    const buffer = Buffer.from(content, 'utf8');
    const uploadFile = vi.fn(async () => ({
      key: 'dataset/file-parsed/image.png'
    }));

    const result = await readFileRawText(
      {
        extension: 'md',
        buffer,
        encoding: 'utf-8'
      },
      { uploadFile }
    );

    expect(uploadFile).toHaveBeenCalledWith({
      name: expect.stringMatching(/\.png$/),
      mime: 'image/png',
      buffer: expect.any(ArrayBuffer)
    });
    expect(result.rawText).toContain('![alt](dataset/file-parsed/image.png)');
    expect(result).not.toHaveProperty('imageList');
  });

  it('should remove base64 images when uploadFile handler is missing', async () => {
    const base64Data =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const content = `段落\n\n![alt](data:image/png;base64,${base64Data})\n`;
    const buffer = Buffer.from(content, 'utf8');

    const result = await readFileRawText({
      extension: 'md',
      buffer,
      encoding: 'utf-8'
    });

    expect(result.rawText).toContain('段落');
    expect(result.rawText).not.toContain('data:image/png;base64');
    expect(result.rawText).not.toContain('![alt]');
    expect(result).not.toHaveProperty('imageList');
  });

  it('should reject oversized base64 image before upload', async () => {
    const oversizedBase64 = 'A'.repeat(Math.ceil((40 * 1024 * 1024 + 1) / 3) * 4);
    const content = `段落\n\n![alt](data:image/png;base64,${oversizedBase64})\n`;
    const uploadFile = vi.fn(async () => ({
      key: 'dataset/file-parsed/image.png'
    }));

    const result = await readFileRawText(
      {
        extension: 'md',
        buffer: Buffer.from(content, 'utf8'),
        encoding: 'utf-8'
      },
      { uploadFile }
    );

    expect(uploadFile).not.toHaveBeenCalled();
    expect(result.rawText).toContain('段落');
    expect(result.rawText).not.toContain('data:image/png;base64');
  });

  it('should process 200 base64 images without carrying imageList', async () => {
    const base64Data =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const imageCount = 200;
    const content = Array.from(
      { length: imageCount },
      (_, i) => `段落 ${i}\n\n![alt-${i}](data:image/png;base64,${base64Data})\n`
    ).join('\n');
    const buffer = Buffer.from(content, 'utf8');
    const uploadFile = vi.fn(async ({ name }: { name: string }) => ({
      key: `dataset/file-parsed/${name}`
    }));

    const start = performance.now();
    const result = await readFileRawText(
      {
        extension: 'md',
        buffer,
        encoding: 'utf-8'
      },
      { uploadFile }
    );
    const duration = performance.now() - start;

    expect(uploadFile).toHaveBeenCalledTimes(imageCount);
    expect(result).not.toHaveProperty('imageList');
    expect(result.rawText).not.toContain('data:image/png;base64');
    expect(duration).toBeLessThan(PERFORMANCE_THRESHOLDS.manyBase64Images);
  });
});
