import { describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  citeOutLinkQuery,
  composeOutLinkQuery,
  createOutLinkFileLimitStream,
  uploadOutLinkFile
} from '@fastgpt/service/support/outLink/tools';

const { uploadChatFile } = vi.hoisted(() => ({ uploadChatFile: vi.fn() }));
vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  getS3ChatSource: () => ({ uploadChatFile })
}));

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
});

describe('createOutLinkFileLimitStream', () => {
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

  it('destroys a stalled source when the timeout is reached', async () => {
    const source = new Readable({ read() {} });

    await expect(
      buffer(createOutLinkFileLimitStream({ source, maxBytes: 10, timeoutMs: 10 }))
    ).rejects.toThrow('OutLink file download timeout');
    expect(source.destroyed).toBe(true);
  });
});

describe('uploadOutLinkFile', () => {
  it('uploads a bounded stream and rejects its declared oversize before S3', async () => {
    uploadChatFile.mockImplementation(async ({ body }: { body: Readable }) => ({
      key: (await buffer(body)).toString()
    }));

    await expect(
      uploadOutLinkFile({
        source: Readable.from(['file']),
        maxBytes: 4,
        appId: '507f1f77bcf86cd799439011',
        chatId: 'chat',
        userId: 'user',
        filename: 'file.txt'
      })
    ).resolves.toEqual({ key: 'file' });
    await expect(
      uploadOutLinkFile({
        source: Readable.from(['ignored']),
        contentLength: 5,
        maxBytes: 4,
        appId: '507f1f77bcf86cd799439011',
        chatId: 'chat',
        userId: 'user',
        filename: 'file.txt'
      })
    ).rejects.toMatchObject({ name: 'OutLinkFileSizeExceededError' });
    expect(uploadChatFile).toHaveBeenCalledTimes(1);
  });
});
