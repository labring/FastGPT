import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkerNameEnum } from '@fastgpt/service/worker/utils';

// hoisted: 这些 mock 必须在 vi.mock 工厂里可见
const { mockRun, mockGetWorkerController, mockRunWorker, mockUploadImage2S3Bucket, mockEnv } =
  vi.hoisted(() => {
    const mockRun = vi.fn();
    return {
      mockRun,
      mockGetWorkerController: vi.fn(() => ({ run: mockRun })),
      mockRunWorker: vi.fn(),
      mockUploadImage2S3Bucket: vi.fn(),
      mockEnv: {
        PARSE_FILE_WORKERS: 10,
        HTML_TO_MARKDOWN_WORKERS: 10,
        TEXT_TO_CHUNKS_WORKERS: 10,
        PARSE_FILE_TIMEOUT_SECONDS: 300
      } as {
        PARSE_FILE_WORKERS: number;
        HTML_TO_MARKDOWN_WORKERS: number;
        TEXT_TO_CHUNKS_WORKERS: number;
        PARSE_FILE_TIMEOUT_SECONDS: number;
      }
    };
  });

// 拦截 getWorkerController / runWorker，保留 WorkerNameEnum 等枚举
vi.mock('@fastgpt/service/worker/utils', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@fastgpt/service/worker/utils')>();
  return {
    ...mod,
    getWorkerController: mockGetWorkerController,
    runWorker: mockRunWorker
  };
});

// 拦截 env，避免每个用例通过修改 process.env 失效（env 在模块加载时已固化）
vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: mockEnv
}));

vi.mock('@fastgpt/service/common/s3/utils', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@fastgpt/service/common/s3/utils')>();
  return {
    ...mod,
    uploadImage2S3Bucket: mockUploadImage2S3Bucket
  };
});

// 必须在 vi.mock 之后再 import 被测模块
const { text2Chunks, readRawContentFromBuffer } = await import('@fastgpt/service/worker/function');
const { htmlToMarkdown } = await import('@fastgpt/service/common/string/utils');

describe('worker/function', () => {
  beforeEach(() => {
    mockRun.mockReset();
    mockGetWorkerController.mockReset();
    mockGetWorkerController.mockImplementation(() => ({ run: mockRun }));
    mockRunWorker.mockReset();
    mockUploadImage2S3Bucket.mockReset();
  });

  describe('text2Chunks', () => {
    it('test 环境下短路调用本地 splitText2Chunks，不创建 worker', async () => {
      const result = await text2Chunks({
        text: 'hello world this is a test',
        chunkSize: 10,
        maxSize: 50
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result.chunks)).toBe(true);
      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks.join('')).toContain('hello world');

      // 关键：测试环境必须走短路，绝不能调起 worker
      expect(mockRunWorker).not.toHaveBeenCalled();
      expect(mockGetWorkerController).not.toHaveBeenCalled();
    });

    it('空文本返回空 chunks 列表', async () => {
      const result = await text2Chunks({ text: '', chunkSize: 100, maxSize: 200 });
      expect(result.chunks).toEqual([]);
    });
  });

  describe('readRawContentFromBuffer', () => {
    afterEach(() => {
      // 防止 env 跨用例污染
      mockEnv.PARSE_FILE_WORKERS = 10;
      mockEnv.PARSE_FILE_TIMEOUT_SECONDS = 300;
    });

    it('默认 transfer 独占 Buffer 并通过 pool.run 派发', async () => {
      const original = Buffer.allocUnsafeSlow(11);
      original.write('hello world', 'utf-8');
      const sourceArrayBuffer = original.buffer;
      const expected = { rawText: 'parsed-content' };
      mockRun.mockResolvedValueOnce(expected);

      const result = await readRawContentFromBuffer({
        extension: 'txt',
        encoding: 'utf-8',
        buffer: original
      });

      expect(result).toEqual(expected);

      // pool 配置
      expect(mockGetWorkerController).toHaveBeenCalledTimes(1);
      const poolCfg = mockGetWorkerController.mock.calls[0][0];
      expect(poolCfg.name).toBe(WorkerNameEnum.readFile);
      expect(poolCfg.maxReservedThreads).toBe(10); // 默认值
      expect(poolCfg.taskTimeoutMs).toBe(5 * 60 * 1000);
      expect(poolCfg.maxTasksPerWorker).toBe(100);

      // run 入参
      expect(mockRun).toHaveBeenCalledTimes(1);
      const runArg = mockRun.mock.calls[0][0];
      expect(runArg.extension).toBe('txt');
      expect(runArg.encoding).toBe('utf-8');
      expect(runArg.bufferSize).toBe(original.length);
      expect(runArg.buffer).toBe(sourceArrayBuffer);
      expect(runArg.sharedBuffer).toBeUndefined();
      expect(mockRun.mock.calls[0][1]).toEqual([sourceArrayBuffer]);
    });

    it('Buffer 不独占 ArrayBuffer 时回退到 SharedArrayBuffer', async () => {
      const original = Buffer.from('prefix:hello world').subarray('prefix:'.length);
      mockRun.mockResolvedValueOnce({ rawText: 'parsed-content' });

      await readRawContentFromBuffer({
        extension: 'txt',
        encoding: 'utf-8',
        buffer: original
      });

      const runArg = mockRun.mock.calls[0][0];
      expect(runArg.buffer).toBeUndefined();
      expect(runArg.sharedBuffer).toBeInstanceOf(SharedArrayBuffer);
      expect(mockRun.mock.calls[0][1]).toBeUndefined();
      expect(Buffer.from(new Uint8Array(runArg.sharedBuffer)).toString('utf-8')).toBe(
        'hello world'
      );
    });

    it('空 Buffer 也能正常构造（byteLength 为 0）', async () => {
      mockRun.mockResolvedValueOnce({ rawText: '' });

      const result = await readRawContentFromBuffer({
        extension: 'txt',
        encoding: 'utf-8',
        buffer: Buffer.alloc(0)
      });

      expect(result).toEqual({ rawText: '' });
      const runArg = mockRun.mock.calls[0][0];
      expect(runArg.bufferSize).toBe(0);
      expect(runArg.buffer.byteLength).toBe(0);
      expect(runArg.sharedBuffer).toBeUndefined();
      expect(mockRun.mock.calls[0][1]).toEqual([runArg.buffer]);
    });

    it('二进制 Buffer 不应在拷贝过程中失真', async () => {
      const bytes = new Uint8Array([0x00, 0x01, 0xff, 0x80, 0x7f, 0xab, 0xcd]);
      const original = Buffer.from(bytes);
      mockRun.mockResolvedValueOnce({ rawText: '' });

      await readRawContentFromBuffer({
        extension: 'pdf',
        encoding: 'utf-8',
        buffer: original
      });

      const runArg = mockRun.mock.calls[0][0];
      const view = new Uint8Array(runArg.buffer ?? runArg.sharedBuffer);
      expect(Array.from(view)).toEqual(Array.from(bytes));
    });

    it('PARSE_FILE_WORKERS 自定义值生效', async () => {
      mockEnv.PARSE_FILE_WORKERS = 8;
      mockRun.mockResolvedValueOnce({ rawText: '' });

      await readRawContentFromBuffer({
        extension: 'txt',
        encoding: 'utf-8',
        buffer: Buffer.from('x')
      });

      const poolCfg = mockGetWorkerController.mock.calls[0][0];
      expect(poolCfg.maxReservedThreads).toBe(8);
    });

    it('PARSE_FILE_TIMEOUT_SECONDS 自定义值生效（秒 -> 毫秒）', async () => {
      mockEnv.PARSE_FILE_TIMEOUT_SECONDS = 120;
      mockRun.mockResolvedValueOnce({ rawText: '' });

      await readRawContentFromBuffer({
        extension: 'txt',
        encoding: 'utf-8',
        buffer: Buffer.from('x')
      });

      const poolCfg = mockGetWorkerController.mock.calls[0][0];
      expect(poolCfg.taskTimeoutMs).toBe(120 * 1000);
    });

    it('pool.run 的错误必须原样抛出', async () => {
      mockRun.mockRejectedValueOnce(new Error('parse failed'));

      await expect(
        readRawContentFromBuffer({
          extension: 'pdf',
          encoding: 'utf-8',
          buffer: Buffer.from('garbage')
        })
      ).rejects.toThrow('parse failed');
    });

    it('传入 imageKeyOptions 时为 readFile worker 注册通用 uploadFile handler', async () => {
      const expected = { rawText: 'parsed docx' };
      const expiredTime = new Date('2030-01-01T00:00:00.000Z');
      mockRun.mockResolvedValueOnce(expected);
      mockUploadImage2S3Bucket.mockResolvedValueOnce('dataset/ds1/file-parsed/image.png');

      const result = await readRawContentFromBuffer({
        extension: 'docx',
        encoding: 'utf-8',
        buffer: Buffer.from('docx'),
        imageKeyOptions: {
          prefix: 'dataset/ds1/file-parsed',
          expiredTime
        }
      });

      expect(result).toEqual(expected);

      const runArg = mockRun.mock.calls[0][0];
      expect(runArg.imageKeyOptions).toEqual({
        prefix: 'dataset/ds1/file-parsed',
        expiredTime
      });

      const handlers = mockRun.mock.calls[0][2];
      expect(handlers?.uploadFile).toBeInstanceOf(Function);

      const uploadResult = await handlers.uploadFile({
        name: '../image.png',
        mime: 'image/png',
        buffer: new Uint8Array([1, 2, 3]).buffer
      });

      expect(uploadResult).toEqual({
        key: 'dataset/ds1/file-parsed/image.png'
      });
      expect(mockUploadImage2S3Bucket).toHaveBeenCalledWith('private', {
        buffer: Buffer.from([1, 2, 3]),
        uploadKey: 'dataset/ds1/file-parsed/image.png',
        mimetype: 'image/png',
        filename: 'image.png',
        expiredTime
      });

      await expect(
        handlers.uploadFile({
          name: 'file.txt',
          mime: 'text/plain',
          buffer: new Uint8Array([1, 2, 3]).buffer
        })
      ).rejects.toThrow('Unsupported worker uploadFile mime type: text/plain');
    });

    it('并发文件解析直接交给 readFile worker pool，并发数由 PARSE_FILE_WORKERS 决定', async () => {
      let activeCount = 0;
      let maxActiveCount = 0;
      const callOrder: string[] = [];
      mockEnv.PARSE_FILE_WORKERS = 3;

      mockRun.mockImplementation(
        async (props: {
          extension: string;
          buffer?: ArrayBuffer;
          sharedBuffer?: SharedArrayBuffer;
        }) => {
          activeCount += 1;
          maxActiveCount = Math.max(maxActiveCount, activeCount);
          const rawBuffer = props.buffer ?? props.sharedBuffer;
          expect(rawBuffer).toBeDefined();
          callOrder.push(Buffer.from(new Uint8Array(rawBuffer!)).toString('utf-8'));

          await new Promise((resolve) => setTimeout(resolve, 20));

          activeCount -= 1;
          return { rawText: 'ok' };
        }
      );

      const results = await Promise.all([
        readRawContentFromBuffer({
          extension: 'pdf',
          encoding: 'utf-8',
          buffer: Buffer.from('pdf-1')
        }),
        readRawContentFromBuffer({
          extension: 'txt',
          encoding: 'utf-8',
          buffer: Buffer.from('txt-1')
        }),
        readRawContentFromBuffer({
          extension: 'md',
          encoding: 'utf-8',
          buffer: Buffer.from('md-1')
        })
      ]);

      expect(results).toEqual([{ rawText: 'ok' }, { rawText: 'ok' }, { rawText: 'ok' }]);
      expect(mockRun).toHaveBeenCalledTimes(3);
      expect(maxActiveCount).toBe(3);
      expect(callOrder).toEqual(expect.arrayContaining(['pdf-1', 'txt-1', 'md-1']));
    });

    it('多次调用每次都通过 getWorkerController 获取池（不在本层缓存）', async () => {
      mockRun.mockResolvedValue({ rawText: 'ok' });

      await readRawContentFromBuffer({
        extension: 'txt',
        encoding: 'utf-8',
        buffer: Buffer.from('a')
      });
      await readRawContentFromBuffer({
        extension: 'txt',
        encoding: 'utf-8',
        buffer: Buffer.from('b')
      });
      await readRawContentFromBuffer({
        extension: 'txt',
        encoding: 'utf-8',
        buffer: Buffer.from('c')
      });

      // 单例由 utils.getWorkerController 内部维护，function.ts 不应自行缓存
      expect(mockGetWorkerController).toHaveBeenCalledTimes(3);
      expect(mockRun).toHaveBeenCalledTimes(3);
    });

    it('fallback 路径每次调用都生成新的 SharedArrayBuffer（避免跨任务串扰）', async () => {
      mockRun.mockResolvedValue({ rawText: 'ok' });

      await readRawContentFromBuffer({
        extension: 'txt',
        encoding: 'utf-8',
        buffer: Buffer.from('xaaa').subarray(1)
      });
      await readRawContentFromBuffer({
        extension: 'txt',
        encoding: 'utf-8',
        buffer: Buffer.from('xbbb').subarray(1)
      });

      const sab1 = mockRun.mock.calls[0][0].sharedBuffer;
      const sab2 = mockRun.mock.calls[1][0].sharedBuffer;
      expect(sab1).not.toBe(sab2);
      expect(new Uint8Array(sab1)[0]).toBe('a'.charCodeAt(0));
      expect(new Uint8Array(sab2)[0]).toBe('b'.charCodeAt(0));
    });
  });

  describe('htmlToMarkdown', () => {
    afterEach(() => {
      mockEnv.HTML_TO_MARKDOWN_WORKERS = 10;
      mockEnv.PARSE_FILE_TIMEOUT_SECONDS = 300;
    });

    it('通过 htmlStr2Md worker pool 派发并返回 rawText', async () => {
      mockRun.mockResolvedValueOnce({ rawText: '# Title' });

      const result = await htmlToMarkdown('<h1>Title</h1>');

      expect(result).toBe('# Title');
      expect(mockRunWorker).not.toHaveBeenCalled();
      expect(mockGetWorkerController).toHaveBeenCalledTimes(1);

      const poolCfg = mockGetWorkerController.mock.calls[0][0];
      expect(poolCfg.name).toBe(WorkerNameEnum.htmlStr2Md);
      expect(poolCfg.maxReservedThreads).toBe(10);
      expect(poolCfg.taskTimeoutMs).toBe(5 * 60 * 1000);
      expect(poolCfg.maxTasksPerWorker).toBe(100);

      expect(mockRun).toHaveBeenCalledWith({ html: '<h1>Title</h1>' });
    });

    it('空 html 统一传空字符串', async () => {
      mockRun.mockResolvedValueOnce({ rawText: '' });

      const result = await htmlToMarkdown(null);

      expect(result).toBe('');
      expect(mockRun).toHaveBeenCalledWith({ html: '' });
    });

    it('HTML_TO_MARKDOWN_WORKERS 自定义值生效', async () => {
      mockEnv.HTML_TO_MARKDOWN_WORKERS = 6;
      mockRun.mockResolvedValueOnce({ rawText: 'ok' });

      await htmlToMarkdown('<p>ok</p>');

      const poolCfg = mockGetWorkerController.mock.calls[0][0];
      expect(poolCfg.maxReservedThreads).toBe(6);
    });
  });
});
