import { describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  citeOutLinkQuery,
  composeOutLinkQuery,
  createOutLinkFileLimitStream
} from '@fastgpt/service/support/outLink/tools';

describe('outLink query composition', () => {
  const parentFile = {
    type: ChatFileTypeEnum.image,
    name: 'parent.png',
    url: 'https://example.com/parent.png'
  };
  const currentFile = {
    type: ChatFileTypeEnum.file,
    name: 'current.txt',
    url: 'https://example.com/current.txt'
  };

  it('merges cited text and keeps files', () => {
    expect(
      citeOutLinkQuery([
        { text: { content: 'parent line 1' } },
        { file: parentFile },
        { text: { content: 'parent line 2' } }
      ])
    ).toEqual([
      { text: { content: '<Cite>parent line 1\nparent line 2</Cite>' } },
      { file: parentFile }
    ]);
  });

  it('composes one text item followed by files in query order', () => {
    expect(
      composeOutLinkQuery(
        citeOutLinkQuery([{ text: { content: 'parent' } }, { file: parentFile }]),
        [{ text: { content: 'current' } }, { file: currentFile }]
      )
    ).toEqual([
      { text: { content: '<Cite>parent</Cite>\ncurrent' } },
      { file: parentFile },
      { file: currentFile }
    ]);
  });

  it('omits empty text and keeps a file-only citation', () => {
    expect(citeOutLinkQuery([{ text: { content: '' } }, { file: parentFile }])).toEqual([
      { file: parentFile }
    ]);
    expect(composeOutLinkQuery([], [{ text: { content: '' } }])).toEqual([]);
  });
});

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
