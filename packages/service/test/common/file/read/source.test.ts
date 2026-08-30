import { documentFileExtensions } from '@fastgpt/global/common/file/constants';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockReadExternalFileBuffer } = vi.hoisted(() => ({
  mockReadExternalFileBuffer: vi.fn()
}));

vi.mock('@fastgpt/service/common/file/read/external', () => ({
  readExternalFileBuffer: mockReadExternalFileBuffer
}));

const {
  createExternalHttpFileSource,
  createS3FileSource,
  materializeFileSource,
  resolveFileSourceDeclaredExtension,
  resolveFileSourceEncoding,
  resolveFileSourceExtension
} = await import('@fastgpt/service/common/file/read/source');

describe('common/file/read/source', () => {
  beforeEach(() => {
    mockReadExternalFileBuffer.mockReset();
  });

  it('S3 source 只保存可信大小，真正物化时才打开对象流', async () => {
    const getStream = vi.fn(async () => Readable.from([Buffer.from('hello')]));
    const source = createS3FileSource({
      sizeBytes: 5,
      metadata: { filename: 'hello.txt', contentType: 'text/plain' },
      getStream
    });

    expect(source).toMatchObject({ kind: 's3', sizeBytes: 5 });
    expect('maxSizeBytes' in source).toBe(false);
    expect(getStream).not.toHaveBeenCalled();

    const controller = new AbortController();
    await expect(materializeFileSource(source, { signal: controller.signal })).resolves.toEqual({
      buffer: Buffer.from('hello'),
      metadata: { filename: 'hello.txt', contentType: 'text/plain' }
    });
    expect(getStream).toHaveBeenCalledWith(controller.signal);
  });

  it('External source 入队时不下载，物化时透传业务字节上限和读取进度', async () => {
    mockReadExternalFileBuffer.mockResolvedValue({
      buffer: Buffer.from('content'),
      contentType: 'text/plain; charset=utf-8',
      contentDisposition: 'attachment; filename="response.md"'
    });
    const source = createExternalHttpFileSource({
      url: 'https://example.com/input',
      maxSizeBytes: 123,
      timeoutMs: 456,
      metadata: { filename: 'input' }
    });

    expect(source).toMatchObject({ kind: 'externalHttp', maxSizeBytes: 123 });
    expect(mockReadExternalFileBuffer).not.toHaveBeenCalled();

    const controller = new AbortController();
    const onReadBytes = vi.fn();
    await expect(source.materialize({ signal: controller.signal, onReadBytes })).resolves.toEqual({
      buffer: Buffer.from('content'),
      metadata: {
        filename: 'response.md',
        contentType: 'text/plain; charset=utf-8'
      }
    });
    expect(mockReadExternalFileBuffer).toHaveBeenCalledWith({
      url: 'https://example.com/input',
      maxSizeBytes: 123,
      timeoutMs: 456,
      signal: controller.signal,
      onReadBytes
    });
  });

  it('可信 File Ref filename 优先于远端 Content-Disposition', async () => {
    mockReadExternalFileBuffer.mockResolvedValue({
      buffer: Buffer.from('content'),
      contentType: 'text/plain',
      contentDisposition: 'attachment; filename="remote.pdf"'
    });
    const source = createExternalHttpFileSource({
      url: 'https://example.com/input',
      maxSizeBytes: 100,
      metadata: { filename: 'trusted.md' },
      trustMetadataFilename: true
    });

    const result = await source.materialize({ signal: new AbortController().signal });
    expect(result.metadata.filename).toBe('trusted.md');
    expect(resolveFileSourceExtension(result)).toBe('md');
  });

  it.each(documentFileExtensions)('共享文档格式 %s 可由 filename 识别', (extension) => {
    expect(resolveFileSourceDeclaredExtension({ filename: `file${extension}` })).toBe(
      extension.replace(/^\./, '').toLowerCase()
    );
  });

  it('统一处理 markdown/htm alias、MIME、文本探测和未知二进制', () => {
    expect(resolveFileSourceDeclaredExtension({ filename: 'README.markdown' })).toBe('md');
    expect(resolveFileSourceDeclaredExtension({ filename: 'page.htm' })).toBe('html');
    expect(resolveFileSourceDeclaredExtension({ contentType: 'text/plain' })).toBe('txt');
    expect(
      resolveFileSourceExtension({
        metadata: { contentType: 'application/octet-stream' },
        buffer: Buffer.from('plain text without extension')
      })
    ).toBe('txt');
    expect(
      resolveFileSourceExtension({
        metadata: { contentType: 'application/octet-stream' },
        buffer: Buffer.from([0, 1, 2, 3, 0, 255])
      })
    ).toBe('');
  });

  it('编码按显式值、Content-Type charset、内容探测排序', () => {
    expect(
      resolveFileSourceEncoding({
        metadata: { encoding: 'gbk', contentType: 'text/plain; charset=utf-8' },
        buffer: Buffer.from('hello')
      })
    ).toBe('gbk');
    expect(
      resolveFileSourceEncoding({
        metadata: { contentType: 'text/plain; charset=iso-8859-1' },
        buffer: Buffer.from('hello')
      })
    ).toBe('iso-8859-1');
    expect(resolveFileSourceEncoding({ metadata: {}, buffer: Buffer.from('hello') })).toBeTruthy();
  });

  it('AbortSignal 会终止 S3 流物化', async () => {
    const stream = new Readable({ read() {} });
    const source = createS3FileSource({
      sizeBytes: 10,
      metadata: { filename: 'slow.txt' },
      getStream: async () => stream
    });
    const controller = new AbortController();
    const pending = source.materialize({ signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(stream.destroyed).toBe(true);
  });
});
