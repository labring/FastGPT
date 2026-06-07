import { describe, expect, it, vi } from 'vitest';
import { readHtmlRawText } from '@fastgpt/service/worker/readFile/extension/html';

describe('readHtmlRawText', () => {
  it('uploads base64 html images in worker and replaces image src with key', async () => {
    const base64Data =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const uploadFile = vi.fn(async () => ({
      key: 'dataset/file-parsed/html-image.png'
    }));

    const result = await readHtmlRawText(
      {
        extension: 'html',
        buffer: Buffer.from(`<p>hello</p><img src="data:image/png;base64,${base64Data}">`),
        encoding: 'utf-8'
      },
      { uploadFile }
    );

    expect(uploadFile).toHaveBeenCalledWith({
      name: expect.stringMatching(/\.png$/),
      mime: 'image/png',
      buffer: expect.any(ArrayBuffer)
    });
    expect(result.rawText).toContain('dataset/file-parsed/html-image.png');
    expect(result.rawText).not.toContain('data:image/png;base64');
    expect(result).not.toHaveProperty('imageList');
  });
});
