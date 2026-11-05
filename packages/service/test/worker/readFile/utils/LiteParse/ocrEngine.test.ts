import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createHttpOcrEngine,
  parseHttpOcrResponse
} from '@fastgpt/service/worker/readFile/utils/LiteParse/ocrEngine';

const OCR_URL = 'http://127.0.0.1:8832/ocr';

const jsonResponse = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init
  });

describe('parseHttpOcrResponse', () => {
  it('保留合法结果并补全可选字段', () => {
    const results = parseHttpOcrResponse({
      results: [
        {
          text: '  Hello  ',
          bbox: [10, 20, 80, 40],
          confidence: 0.9,
          polygon: [
            [10, 20],
            [80, 20],
            [80, 40],
            [10, 40]
          ]
        }
      ]
    });

    expect(results).toEqual([
      {
        text: 'Hello',
        bbox: [10, 20, 80, 40],
        confidence: 0.9,
        polygon: [
          [10, 20],
          [80, 20],
          [80, 40],
          [10, 40]
        ]
      }
    ]);
  });

  it('跳过空文本和非法 bbox，缺失置信度按 1 处理', () => {
    const results = parseHttpOcrResponse({
      results: [
        { text: '', bbox: [0, 0, 10, 10], confidence: 0.5 },
        { text: 'no bbox' },
        { text: 'bad bbox', bbox: [10, 10, 0, 0] },
        { text: 'short bbox', bbox: [0, 0, 10] },
        { text: 'kept', bbox: [0, 0, 10, 10] }
      ]
    });

    expect(results).toEqual([{ text: 'kept', bbox: [0, 0, 10, 10], confidence: 1 }]);
  });

  it('置信度裁剪到 0～1，非法 polygon 直接忽略', () => {
    const results = parseHttpOcrResponse({
      results: [
        { text: 'high', bbox: [0, 0, 10, 10], confidence: 8, polygon: [[0, 0]] },
        { text: 'low', bbox: [0, 0, 10, 10], confidence: -3 }
      ]
    });

    expect(results).toEqual([
      { text: 'high', bbox: [0, 0, 10, 10], confidence: 1 },
      { text: 'low', bbox: [0, 0, 10, 10], confidence: 0 }
    ]);
  });

  it('响应缺少 results 数组时抛错', () => {
    expect(() => parseHttpOcrResponse({})).toThrow('missing a "results" array');
    expect(() => parseHttpOcrResponse(null)).toThrow('not a JSON object');
    expect(() => parseHttpOcrResponse({ results: 'text' })).toThrow('missing a "results" array');
  });
});

describe('createHttpOcrEngine', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('按 LiteParse OCR 规范发送 multipart 请求并携带鉴权头', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ results: [{ text: '识别结果', bbox: [1, 2, 3, 4], confidence: 0.8 }] })
    );

    const engine = createHttpOcrEngine({ url: OCR_URL, key: 'secret', timeoutMs: 5000 });
    const results = await engine.recognize(new Uint8Array([1, 2, 3]), 640, 480, 'en');

    expect(results).toEqual([{ text: '识别结果', bbox: [1, 2, 3, 4], confidence: 0.8 }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(OCR_URL);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Authorization: 'Bearer secret' });
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const form = init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('language')).toBe('en');

    const file = form.get('file') as File;
    expect(file.name).toBe('page.png');
    expect(file.type).toBe('image/png');
    expect(file.size).toBe(3);
  });

  it('未配置密钥时不发送 Authorization 头', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ results: [] }));

    const engine = createHttpOcrEngine({ url: OCR_URL, timeoutMs: 5000 });
    await engine.recognize(new Uint8Array([1]), 10, 10, 'eng');

    expect(fetchMock.mock.calls[0][1].headers).toBeUndefined();
  });

  it('非 2xx 响应抛出带状态码和响应体的错误', async () => {
    fetchMock.mockResolvedValue(
      new Response('model not loaded', { status: 503, statusText: 'Service Unavailable' })
    );

    const engine = createHttpOcrEngine({ url: OCR_URL, timeoutMs: 5000 });

    await expect(engine.recognize(new Uint8Array([1]), 10, 10, 'eng')).rejects.toThrow(
      'OCR server returned HTTP 503: model not loaded'
    );
  });

  it('超时后中止请求并抛出可读错误', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        })
    );

    const engine = createHttpOcrEngine({ url: OCR_URL, timeoutMs: 3000 });
    const assertion = expect(engine.recognize(new Uint8Array([1]), 10, 10, 'eng')).rejects.toThrow(
      'OCR request timed out after 3000 ms'
    );

    await vi.advanceTimersByTimeAsync(3000);
    await assertion;
  });

  it('服务返回非法 JSON 结构时抛错，避免脏数据进入版面合并', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ text: 'not a results array' }));

    const engine = createHttpOcrEngine({ url: OCR_URL, timeoutMs: 5000 });

    await expect(engine.recognize(new Uint8Array([1]), 10, 10, 'eng')).rejects.toThrow(
      'missing a "results" array'
    );
  });

  it('响应体不是 JSON 时抛出明确错误', async () => {
    fetchMock.mockResolvedValue(new Response('<html>gateway</html>', { status: 200 }));

    const engine = createHttpOcrEngine({ url: OCR_URL, timeoutMs: 5000 });

    await expect(engine.recognize(new Uint8Array([1]), 10, 10, 'eng')).rejects.toThrow(
      'OCR server returned invalid JSON'
    );
  });
});
