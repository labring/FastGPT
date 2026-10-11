import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axios } from '@fastgpt/service/common/api/axios';
import { inferFileTypeFromUrl } from '@fastgpt/service/common/file/infer/service';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=',
  'base64'
);
const url = 'https://example.com/download?token=original#fragment';
const response = (headers: Record<string, string> = {}, body = Buffer.alloc(0), status = 200) => ({
  headers,
  data: Readable.from([body]),
  status
});
const httpError = (status: number) => ({
  isAxiosError: true,
  response: response({}, Buffer.from('error'), status)
});

beforeEach(() => {
  vi.spyOn(axios, 'head').mockResolvedValue(response());
  vi.spyOn(axios, 'get').mockResolvedValue(response({}, png));
});
afterEach(() => vi.restoreAllMocks());

describe('inferFileTypeFromUrl', () => {
  it('HEAD 明确 MIME 即返回元数据，不下载正文，原始 URL 完整保留', async () => {
    const head = response({
      'content-type': 'IMAGE/PNG; charset=binary',
      'content-disposition': "attachment; filename*=UTF-8''%E5%9B%BE%E7%89%87.jpg"
    });
    vi.mocked(axios.head).mockResolvedValueOnce(head);
    expect(await inferFileTypeFromUrl({ url })).toEqual({
      url,
      filename: '图片.png',
      extension: '.png',
      contentType: 'image/png'
    });
    expect(head.data.destroyed).toBe(true);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it.each([403, 405, 501])('HEAD %s 回退 GET，明确响应头无需读取流', async (status) => {
    const error = httpError(status);
    vi.mocked(axios.head).mockRejectedValueOnce(error);
    const get = response({ 'content-type': 'application/pdf' });
    vi.mocked(axios.get).mockResolvedValueOnce(get);
    const validateUrl = vi.fn(() => true);
    expect(await inferFileTypeFromUrl({ url, validateUrl })).toEqual({
      url,
      filename: 'download.pdf',
      extension: '.pdf',
      contentType: 'application/pdf'
    });
    expect(axios.get).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        responseType: 'stream',
        decompress: false,
        headers: { 'Accept-Encoding': 'identity', Range: 'bytes=0-8191' },
        __safeAxios: { validateUrl }
      })
    );
    expect(error.response.data.destroyed).toBe(true);
    expect(get.data.destroyed).toBe(true);
    expect(get.data.readableDidRead).toBe(false);
  });

  it.each(['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET'])('HEAD %s 回退有限 GET', async (code) => {
    vi.mocked(axios.head).mockRejectedValueOnce({ isAxiosError: true, code });
    expect((await inferFileTypeFromUrl({ url })).contentType).toBe('image/png');
  });

  it.each([401, 404, 410, 500])('HEAD %s 不盲目重试', async (status) => {
    const error = httpError(status);
    vi.mocked(axios.head).mockRejectedValueOnce(error);
    await expect(inferFileTypeFromUrl({ url })).rejects.toBe(error);
    expect(error.response.data.destroyed).toBe(true);
    expect(axios.get).not.toHaveBeenCalled();
  });

  it.each(['Invalid file URL domain', 'Request to private network not allowed'])(
    '安全拒绝不回退：%s',
    async (message) => {
      vi.mocked(axios.head).mockRejectedValueOnce(new Error(message));
      await expect(inferFileTypeFromUrl({ url })).rejects.toThrow(message);
      expect(axios.get).not.toHaveBeenCalled();
    }
  );

  it.each(['', 'application/octet-stream', 'binary/octet-stream', 'application/binary'])(
    '通用 MIME %s 用真实 PNG 签名推测',
    async (mime) => {
      vi.mocked(axios.head).mockResolvedValueOnce(response({ 'content-type': mime }));
      vi.mocked(axios.get).mockResolvedValueOnce(response({ 'content-type': mime }, png));
      expect(await inferFileTypeFromUrl({ url })).toEqual({
        url,
        filename: 'download.png',
        extension: '.png',
        contentType: 'image/png'
      });
    }
  );

  it('支持合法 206，并在流分块跨签名边界时合并识别', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      ...response({ 'content-range': `bytes 0-${png.length - 1}/${png.length}` }, png, 206),
      data: Readable.from([png.subarray(0, 3), png.subarray(3)])
    });
    expect((await inferFileTypeFromUrl({ url })).extension).toBe('.png');
  });

  it.each(['', 'bytes 1-5/10', 'invalid'])('拒绝非文件起点的 206：%s', async (range) => {
    const get = response({ 'content-range': range }, png, 206);
    vi.mocked(axios.get).mockResolvedValueOnce(get);
    await expect(inferFileTypeFromUrl({ url })).rejects.toThrow('byte zero');
    expect(get.data.destroyed).toBe(true);
  });

  it('服务端忽略 Range 时不会扫描 8 KiB 之后的字节', async () => {
    const get = response(
      { 'content-length': '999999999' },
      Buffer.concat([Buffer.alloc(8192), png])
    );
    vi.mocked(axios.get).mockResolvedValueOnce(get);
    expect(await inferFileTypeFromUrl({ url })).toEqual({
      url,
      filename: 'download',
      extension: '',
      contentType: 'application/octet-stream'
    });
    expect(get.data.destroyed).toBe(true);
  });

  it('服务端忽略 identity 时不把压缩体误识别成原始文件', async () => {
    const get = response({ 'content-encoding': 'gzip' }, png);
    vi.mocked(axios.get).mockResolvedValueOnce(get);
    expect((await inferFileTypeFromUrl({ url })).extension).toBe('');
    expect(get.data.readableDidRead).toBe(false);
    expect(get.data.destroyed).toBe(true);
  });

  it.each([Buffer.alloc(0), png.subarray(0, 8)])('空或截断的容器签名返回未知', async (body) => {
    vi.mocked(axios.get).mockResolvedValueOnce(response({}, body));
    expect((await inferFileTypeFromUrl({ url })).contentType).toBe('application/octet-stream');
  });

  it.each([
    ['https://example.com/%E6%96%87%E6%A1%A3.txt', '文档.txt', '.txt', 'text/plain'],
    ['https://example.com/%invalid', '%invalid', '', 'application/octet-stream'],
    [
      'https://example.com/?filename=C%3A%5Cdir%5Creport.PDF',
      'report.pdf',
      '.pdf',
      'application/pdf'
    ],
    ['https://example.com/', 'file', '', 'application/octet-stream'],
    ['https://example.com/?filename=..', 'file', '', 'application/octet-stream'],
    ['https://example.com/?filename=a%2520b.txt', 'a%20b.txt', '.txt', 'text/plain']
  ])('签名未知时安全提取文件名 %s', async (input, filename, extension, contentType) => {
    vi.mocked(axios.get).mockResolvedValueOnce(response());
    expect(await inferFileTypeFromUrl({ url: input })).toEqual({
      url: input,
      filename,
      extension,
      contentType
    });
  });

  it('GET 文件名优先于 HEAD；等价 MIME 保留 .jpeg 而非强制 .jpg', async () => {
    vi.mocked(axios.head).mockResolvedValueOnce(
      response({ 'content-disposition': 'attachment; filename="old"' })
    );
    vi.mocked(axios.get).mockResolvedValueOnce(
      response({
        'content-disposition': 'attachment; filename="../new.JPEG"',
        'content-type': 'image/jpeg'
      })
    );
    expect((await inferFileTypeFromUrl({ url })).filename).toBe('new.jpeg');
  });

  it('GET 没有文件名时保留 HEAD 文件名', async () => {
    vi.mocked(axios.head).mockResolvedValueOnce(
      response({ 'content-disposition': 'attachment; filename="abc"' })
    );
    expect((await inferFileTypeFromUrl({ url })).filename).toBe('abc.png');
  });

  it('流异常直接抛出并释放资源', async () => {
    const data = new Readable({
      read() {
        this.destroy(new Error('connection lost'));
      }
    });
    vi.mocked(axios.get).mockResolvedValueOnce({ ...response(), data });
    await expect(inferFileTypeFromUrl({ url })).rejects.toThrow('connection lost');
    expect(data.destroyed).toBe(true);
  });

  it('调用方取消时中断 GET，并移除事件监听器', async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    vi.mocked(axios.get).mockImplementationOnce(async (_url, config) => {
      controller.abort();
      expect(config?.signal?.aborted).toBe(true);
      throw new Error('cancelled');
    });
    await expect(inferFileTypeFromUrl({ url, signal: controller.signal })).rejects.toThrow();
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('已经取消时不会发送请求', async () => {
    await expect(inferFileTypeFromUrl({ url, signal: AbortSignal.abort() })).rejects.toThrow();
    expect(axios.head).not.toHaveBeenCalled();
  });

  it('总预算耗尽的 HEAD 不再回退 GET', async () => {
    vi.mocked(axios.head).mockImplementationOnce(async (_url, config) => {
      await new Promise<void>((resolve) =>
        config?.signal?.addEventListener?.('abort', () => resolve())
      );
      throw { isAxiosError: true, code: 'ECONNABORTED' };
    });
    await expect(inferFileTypeFromUrl({ url, timeoutMs: 20 })).rejects.toMatchObject({
      code: 'ECONNABORTED'
    });
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('GET 的 HTTP 错误抛出并关闭错误正文', async () => {
    const error = httpError(404);
    vi.mocked(axios.get).mockRejectedValueOnce(error);
    await expect(inferFileTypeFromUrl({ url })).rejects.toBe(error);
    expect(error.response.data.destroyed).toBe(true);
  });

  it.each([
    [Buffer.from('%PDF-1.7\n'), 'application/pdf', '.pdf'],
    [Buffer.from('RIFF0000WAVEfmt 000000000000'), 'audio/wav', '.wav'],
    [Buffer.from('00000018667479706d703432000000006d70343269736f6d', 'hex'), 'video/mp4', '.mp4']
  ])('用真实文件头识别 %s', async (body, mime, extension) => {
    vi.mocked(axios.get).mockResolvedValueOnce(response({}, body));
    expect(await inferFileTypeFromUrl({ url })).toMatchObject({ contentType: mime, extension });
  });

  it.each(['relative', 'file:///tmp/a', 'data:image/png;base64,ABC'])(
    '拒绝非 HTTP 链接 %s',
    async (input) => {
      await expect(inferFileTypeFromUrl({ url: input })).rejects.toThrow();
      expect(axios.head).not.toHaveBeenCalled();
    }
  );

  it.each([0, -1, Infinity, NaN])('拒绝无效预算 %s', async (timeoutMs) => {
    await expect(inferFileTypeFromUrl({ url, timeoutMs })).rejects.toThrow('timeout');
  });
});
