import { describe, it, expect } from 'vitest';
import { Readable, PassThrough } from 'stream';
import { stream2Encoding } from '@fastgpt/service/common/file/gridfs/utils';

/**
 * Collects all data from a readable stream into a single Buffer.
 */
const streamToBuffer = (stream: NodeJS.ReadableStream): Promise<Buffer> => {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
};

describe('stream2Encoding', () => {
  it('should return encoding and a readable copy stream for UTF-8 content', async () => {
    const content = 'Hello, this is a UTF-8 string with some characters.';
    const inputStream = Readable.from(Buffer.from(content, 'utf-8'));

    const result = await stream2Encoding(inputStream);

    expect(result).toHaveProperty('encoding');
    expect(result).toHaveProperty('stream');
    expect(typeof result.encoding).toBe('string');
    expect(result.encoding).toBeTruthy();
    expect(result.stream).toBeInstanceOf(PassThrough);
  });

  it('should handle streams shorter than 200 bytes (end event path)', async () => {
    const shortContent = 'Short UTF-8 text';
    expect(Buffer.byteLength(shortContent, 'utf-8')).toBeLessThan(200);

    const inputStream = Readable.from(Buffer.from(shortContent, 'utf-8'));

    const result = await stream2Encoding(inputStream);

    expect(result).toHaveProperty('encoding');
    expect(typeof result.encoding).toBe('string');
    expect(result.encoding).toBeTruthy();

    const outputData = await streamToBuffer(result.stream);
    expect(outputData.toString('utf-8')).toBe(shortContent);
  });

  it('should handle streams longer than 200 bytes (totalLength >= 200 path)', async () => {
    // Create content well over 200 bytes
    const longContent = 'A'.repeat(500);
    expect(Buffer.byteLength(longContent, 'utf-8')).toBeGreaterThanOrEqual(200);

    const inputStream = Readable.from(Buffer.from(longContent, 'utf-8'));

    const result = await stream2Encoding(inputStream);

    expect(result).toHaveProperty('encoding');
    expect(typeof result.encoding).toBe('string');
    expect(result.encoding).toBeTruthy();

    const outputData = await streamToBuffer(result.stream);
    expect(outputData.toString('utf-8')).toBe(longContent);
  });

  it('should handle stream errors', async () => {
    const errorMessage = 'Simulated stream read error';
    const errorStream = new Readable({
      read() {
        this.destroy(new Error(errorMessage));
      }
    });
    // Pipe to PassThrough so stream2Encoding can attach its pipe before error fires
    const passthrough = new PassThrough();
    errorStream.pipe(passthrough);

    await expect(stream2Encoding(errorStream)).rejects.toThrow(errorMessage);
  });

  it('should return a copy stream that contains the same data as the original', async () => {
    const content = 'Verify that the piped copy stream preserves all original data intact.';
    const inputStream = Readable.from(Buffer.from(content, 'utf-8'));

    const result = await stream2Encoding(inputStream);

    const copyData = await streamToBuffer(result.stream);
    expect(copyData.toString('utf-8')).toBe(content);
    expect(copyData.length).toBe(Buffer.byteLength(content, 'utf-8'));
  });

  it('should handle streams with exactly 200 bytes', async () => {
    const exactContent = 'B'.repeat(200);
    expect(Buffer.byteLength(exactContent, 'utf-8')).toBe(200);

    const inputStream = Readable.from(Buffer.from(exactContent, 'utf-8'));

    const result = await stream2Encoding(inputStream);

    expect(result).toHaveProperty('encoding');
    expect(typeof result.encoding).toBe('string');

    const outputData = await streamToBuffer(result.stream);
    expect(outputData.toString('utf-8')).toBe(exactContent);
  });

  it('should handle empty streams', async () => {
    const inputStream = Readable.from(Buffer.alloc(0));

    const result = await stream2Encoding(inputStream);

    expect(result).toHaveProperty('encoding');
    expect(result).toHaveProperty('stream');

    const outputData = await streamToBuffer(result.stream);
    expect(outputData.length).toBe(0);
  });

  it('should handle multi-chunk streams that cross the 200-byte threshold', async () => {
    // Create a stream that emits multiple small chunks
    const chunkSize = 50;
    const totalChunks = 6; // 300 bytes total, crosses 200 threshold mid-stream
    const chunks: Buffer[] = [];
    for (let i = 0; i < totalChunks; i++) {
      chunks.push(Buffer.from('C'.repeat(chunkSize), 'utf-8'));
    }

    const inputStream = new Readable({
      read() {
        const chunk = chunks.shift();
        if (chunk) {
          this.push(chunk);
        } else {
          this.push(null);
        }
      }
    });

    const result = await stream2Encoding(inputStream);

    expect(result).toHaveProperty('encoding');
    expect(typeof result.encoding).toBe('string');

    const outputData = await streamToBuffer(result.stream);
    expect(outputData.length).toBe(chunkSize * totalChunks);
    expect(outputData.toString('utf-8')).toBe('C'.repeat(chunkSize * totalChunks));
  });
});
