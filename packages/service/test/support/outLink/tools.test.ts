import { describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { createOutLinkFileLimitStream } from '@fastgpt/service/support/outLink/tools';

describe('createOutLinkFileLimitStream', () => {
  it('forwards chunks without changing their order or content', async () => {
    const source = Readable.from([Buffer.from('hello'), Buffer.from(' '), Buffer.from('world')]);

    const result = await buffer(createOutLinkFileLimitStream({ source, maxBytes: 11 }));

    expect(result.toString()).toBe('hello world');
  });

  it('allows content whose size equals the limit', async () => {
    const source = Readable.from([Buffer.from('123'), Buffer.from('45')]);

    const result = await buffer(createOutLinkFileLimitStream({ source, maxBytes: 5 }));

    expect(result.toString()).toBe('12345');
  });

  it('destroys the source and throws a stable error when content exceeds the limit', async () => {
    let sourceClosed = false;
    const source = Readable.from(
      (async function* () {
        try {
          yield Buffer.from('123');
          yield Buffer.from('456');
        } finally {
          sourceClosed = true;
        }
      })()
    );

    await expect(
      buffer(createOutLinkFileLimitStream({ source, maxBytes: 5 }))
    ).rejects.toMatchObject({
      name: 'OutLinkFileSizeExceededError',
      maxBytes: 5
    });
    expect(sourceClosed).toBe(true);
    expect(source.destroyed).toBe(true);
  });

  it('propagates source stream errors', async () => {
    const sourceError = new Error('download failed');
    const source = Readable.from(
      (async function* () {
        yield Buffer.from('123');
        throw sourceError;
      })()
    );

    await expect(buffer(createOutLinkFileLimitStream({ source, maxBytes: 10 }))).rejects.toBe(
      sourceError
    );
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid maxBytes value %s',
    (maxBytes) => {
      expect(() =>
        createOutLinkFileLimitStream({
          source: Readable.from([]),
          maxBytes
        })
      ).toThrow('maxBytes must be a finite positive number');
    }
  );
});
