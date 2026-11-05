import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLiteParseInit, mockLiteParseParse, mockLiteParseFree, mockLiteParseConstructor } =
  vi.hoisted(() => ({
    mockLiteParseInit: vi.fn(),
    mockLiteParseParse: vi.fn(),
    mockLiteParseFree: vi.fn(),
    mockLiteParseConstructor: vi.fn()
  }));

vi.mock('@llamaindex/liteparse-wasm', () => ({
  default: mockLiteParseInit,
  LiteParse: vi.fn(function MockLiteParse(config) {
    mockLiteParseConstructor(config);
    return {
      parse: mockLiteParseParse,
      free: mockLiteParseFree
    };
  })
}));

const OCR_URL = 'http://127.0.0.1:8832/ocr';

/**
 * 每次重新导入模块，让 workerEnv 读取当前测试设置的 process.env。
 */
const importLiteParse = async () => {
  vi.resetModules();
  return import('@fastgpt/service/worker/readFile/utils/LiteParse');
};

const emptyParseResult = { text: '', pages: [] };

describe('readPdfByLiteParse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLiteParseParse.mockResolvedValue(emptyParseResult);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('分批使用 LiteParse，并对全部 textItems 做统一后处理', async () => {
    const { readPdfByLiteParse } = await importLiteParse();

    mockLiteParseParse
      .mockResolvedValueOnce({
        text: 'fallback text 1',
        pages: [
          {
            pageNum: 1,
            width: 1000,
            height: 1000,
            text: '',
            textItems: [
              {
                text: '人工智能正在快速发展并进入规模化落地阶段',
                x: 80,
                y: 100,
                width: 240,
                height: 12
              }
            ]
          }
        ]
      })
      .mockResolvedValueOnce({
        text: 'fallback text 2',
        pages: [
          {
            pageNum: 101,
            width: 1000,
            height: 1000,
            text: '',
            textItems: [{ text: '并推动产业升级。', x: 80, y: 120, width: 96, height: 12 }]
          }
        ]
      })
      .mockResolvedValueOnce({
        text: '',
        pages: []
      });

    const result = await readPdfByLiteParse({
      extension: 'pdf',
      encoding: 'utf-8',
      buffer: Buffer.from('pdf')
    });

    expect(result.rawText).toBe('人工智能正在快速发展并进入规模化落地阶段并推动产业升级。\n');
    expect(mockLiteParseParse).toHaveBeenCalledTimes(3);
    expect(mockLiteParseInit).toHaveBeenCalledTimes(1);
    expect(mockLiteParseFree).toHaveBeenCalledTimes(3);
    expect(mockLiteParseConstructor.mock.calls.map(([config]) => config.targetPages)).toEqual([
      '1-100',
      '101-200',
      '201-300'
    ]);
  });

  it('WASM 解析失败时仍释放 parser', async () => {
    const { readPdfByLiteParse } = await importLiteParse();

    const error = new Error('invalid PDF');
    mockLiteParseParse.mockRejectedValueOnce(error);

    await expect(
      readPdfByLiteParse({
        extension: 'pdf',
        encoding: 'utf-8',
        buffer: Buffer.from('invalid pdf')
      })
    ).rejects.toThrow(error);

    expect(mockLiteParseFree).toHaveBeenCalledTimes(1);
  });

  it('未配置 OCR 服务时保持关闭，不构造 ocrEngine', async () => {
    const { readPdfByLiteParse } = await importLiteParse();

    await readPdfByLiteParse({
      extension: 'pdf',
      encoding: 'utf-8',
      buffer: Buffer.from('pdf')
    });

    const config = mockLiteParseConstructor.mock.calls[0][0];
    expect(config.ocrEnabled).toBe(false);
    expect(config).not.toHaveProperty('ocrEngine');
    expect(config).not.toHaveProperty('ocrLanguage');
  });

  it('配置 OCR 服务后启用回调，并按环境变量调用外部服务', async () => {
    vi.stubEnv('LITEPARSE_OCR_SERVER_URL', OCR_URL);
    vi.stubEnv('LITEPARSE_OCR_SERVER_KEY', 'secret');
    vi.stubEnv('LITEPARSE_OCR_LANGUAGE', 'en');
    vi.stubEnv('LITEPARSE_OCR_TIMEOUT_MS', '5000');

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ results: [{ text: 'hi', bbox: [1, 2, 3, 4], confidence: 0.9 }] }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const { readPdfByLiteParse } = await importLiteParse();

    await readPdfByLiteParse({
      extension: 'pdf',
      encoding: 'utf-8',
      buffer: Buffer.from('pdf')
    });

    const config = mockLiteParseConstructor.mock.calls[0][0];
    expect(config.ocrEnabled).toBe(true);
    expect(config.ocrLanguage).toBe('en');
    expect(config.ocrEngine).toEqual({ recognize: expect.any(Function) });

    const results = await config.ocrEngine.recognize(new Uint8Array([1, 2, 3]), 100, 100, 'en');

    expect(results).toEqual([{ text: 'hi', bbox: [1, 2, 3, 4], confidence: 0.9 }]);
    expect(fetchMock).toHaveBeenCalledWith(
      OCR_URL,
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer secret' }
      })
    );
  });
});
