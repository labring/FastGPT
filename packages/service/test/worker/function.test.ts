import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkerNameEnum } from '@fastgpt/service/worker/utils';

// hoisted: 这些 mock 必须在 vi.mock 工厂里可见
const { mockRun, mockGetWorkerController, mockRunWorker, mockEnv } = vi.hoisted(() => {
  const mockRun = vi.fn();
  return {
    mockRun,
    mockGetWorkerController: vi.fn(() => ({ run: mockRun })),
    mockRunWorker: vi.fn(),
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

// 必须在 vi.mock 之后再 import 被测模块
const { text2Chunks, readRawContentFromBuffer } = await import('@fastgpt/service/worker/function');
const { htmlToMarkdown } = await import('@fastgpt/service/common/string/utils');

describe('worker/function', () => {
  beforeEach(() => {
    mockRun.mockReset();
    mockGetWorkerController.mockReset();
    mockGetWorkerController.mockImplementation(() => ({ run: mockRun }));
    mockRunWorker.mockReset();
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

    it('使用 SharedArrayBuffer 包装 Buffer 并通过 pool.run 派发', async () => {
      const original = Buffer.from('hello world', 'utf-8');
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
      expect(runArg.sharedBuffer).toBeInstanceOf(SharedArrayBuffer);

      // SharedArrayBuffer 内容必须完整复刻原 Buffer
      expect(runArg.sharedBuffer.byteLength).toBe(original.length);
      const sharedView = new Uint8Array(runArg.sharedBuffer);
      expect(Array.from(sharedView)).toEqual(Array.from(original));
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
      expect(runArg.sharedBuffer.byteLength).toBe(0);
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
      const sharedView = new Uint8Array(runArg.sharedBuffer);
      expect(Array.from(sharedView)).toEqual(Array.from(bytes));
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

    it('每次调用都生成新的 SharedArrayBuffer（避免跨任务串扰）', async () => {
      mockRun.mockResolvedValue({ rawText: 'ok' });

      await readRawContentFromBuffer({
        extension: 'txt',
        encoding: 'utf-8',
        buffer: Buffer.from('aaa')
      });
      await readRawContentFromBuffer({
        extension: 'txt',
        encoding: 'utf-8',
        buffer: Buffer.from('bbb')
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
      mockRun.mockResolvedValueOnce({ rawText: '# Title', imageList: [] });

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
      mockRun.mockResolvedValueOnce({ rawText: '', imageList: [] });

      const result = await htmlToMarkdown(null);

      expect(result).toBe('');
      expect(mockRun).toHaveBeenCalledWith({ html: '' });
    });

    it('HTML_TO_MARKDOWN_WORKERS 自定义值生效', async () => {
      mockEnv.HTML_TO_MARKDOWN_WORKERS = 6;
      mockRun.mockResolvedValueOnce({ rawText: 'ok', imageList: [] });

      await htmlToMarkdown('<p>ok</p>');

      const poolCfg = mockGetWorkerController.mock.calls[0][0];
      expect(poolCfg.maxReservedThreads).toBe(6);
    });
  });
});
