import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ChatFileTypeEnum,
  ChatRoleEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { prepareWorkflowFileContext } from '@fastgpt/service/core/workflow/utils/fileContext';
import {
  getWorkflowFileContext,
  prepareWorkflowFiles,
  readWorkflowFileBuffer,
  runWithContext,
  runWithDerivedWorkflowFileContext
} from '@fastgpt/service/core/workflow/utils/context';
import { getInputFiles } from '@fastgpt/service/core/workflow/dispatch/ai/chat/fileContext';
import { rewriteWorkflowAIUserMessageWithFiles } from '@fastgpt/service/core/workflow/dispatch/ai/fileContext';
import { normalizeDatasetSearchInput } from '@fastgpt/service/core/workflow/dispatch/dataset/utils';
import { normalizeReadableFileUrl } from '@fastgpt/service/core/chat/fileContext';
import { validateFileUrlDomain } from '@fastgpt/service/common/security/fileUrlValidator';
import { axios } from '@fastgpt/service/common/api/axios';
import { inferFileTypeFromUrl } from '@fastgpt/service/common/file/infer/service';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=',
  'base64'
);
const textBody = Buffer.from('External document integration: 文件正文。');
const requests: { method: string; path: string; status: number; bytes: number; range?: string }[] =
  [];
let origin = '';
let active = 0;
let peak = 0;
const timers = new Set<ReturnType<typeof setTimeout>>();

// 使用实际 TCP 服务，记录到达服务端的请求；不替换 axios、分类器、Context 或节点适配器。
const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', origin);
  const entry = {
    method: req.method ?? '',
    path: url.pathname,
    status: 0,
    bytes: 0,
    range: req.headers.range
  };
  requests.push(entry);
  active += 1;
  peak = Math.max(peak, active);
  res.once('close', () => {
    active -= 1;
  });

  const respond = () => {
    if (res.destroyed) return;
    if (url.pathname === '/large' || url.pathname === '/stall' || url.pathname === '/partial') {
      const partial = url.pathname === '/partial' && req.method === 'GET';
      entry.status = partial ? 206 : 200;
      res.writeHead(entry.status, {
        'content-type': 'application/octet-stream',
        ...(partial ? { 'content-range': 'bytes 0-8191/1048576' } : {})
      });
      if (req.method === 'HEAD') return res.end();
      if (url.pathname === '/stall') {
        res.flushHeaders();
        return;
      }
      const prefix = Buffer.concat([png, Buffer.alloc(8192 - png.length)]);
      entry.bytes += prefix.length;
      res.write(prefix);
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (res.destroyed) return;
        entry.bytes += 1024 * 1024;
        res.end(Buffer.alloc(1024 * 1024));
      }, 200);
      timers.add(timer);
      res.once('close', () => {
        clearTimeout(timer);
        timers.delete(timer);
      });
      return;
    }
    if (url.pathname === '/get-redirect' && req.method === 'GET') {
      entry.status = 302;
      res.writeHead(302, { location: `${origin.replace('127.0.0.1', 'localhost.')}/image` });
      res.end();
      return;
    }
    if (url.pathname === '/redirect' || url.pathname === '/blocked-redirect') {
      entry.status = 302;
      res.writeHead(302, {
        location:
          url.pathname === '/redirect'
            ? '/image'
            : `${origin.replace('127.0.0.1', 'localhost.')}/image`
      });
      res.end();
      return;
    }
    if (['/no-head', '/get-redirect'].includes(url.pathname) && req.method === 'HEAD') {
      entry.status = 405;
      res.writeHead(405);
      res.end();
      return;
    }
    const document = url.pathname === '/document' || url.pathname === '/misleading.png';
    const body = document ? textBody : png;
    const contentType =
      url.pathname === '/generic' || url.pathname.startsWith('/delayed-generic')
        ? 'application/octet-stream'
        : document
          ? 'text/plain; charset=utf-8'
          : 'image/png';
    entry.status = 200;
    res.writeHead(200, {
      'content-type': contentType,
      'content-length': body.length,
      ...(document ? { 'content-disposition': 'attachment; filename="report.txt"' } : {})
    });
    if (req.method !== 'HEAD') entry.bytes = body.length;
    res.end(req.method === 'HEAD' ? undefined : body);
  };
  const delay = url.pathname === '/timeout' ? 4000 : url.pathname.startsWith('/delayed') ? 100 : 0;
  if (!delay) return respond();
  const timer = setTimeout(() => {
    timers.delete(timer);
    respond();
  }, delay);
  timers.add(timer);
});

/** 创建真正的工作流文件 Context；本组不涉及私有 S3 文件及模型付费调用。 */
const prepare = (urls: string[] = [], maxFileAmount = 20) =>
  prepareWorkflowFileContext({
    query: urls.map((url) => ({ file: { type: ChatFileTypeEnum.file, name: '', url } })),
    histories: [],
    scope: {
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'file-integration',
      uid: 'test',
      chatId: 'test'
    },
    maxFileAmount,
    maxBytesPerFile: 1024 * 1024
  });

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
beforeEach(() => {
  requests.length = 0;
  peak = 0;
  global.systemEnv = { fileUrlWhitelist: ['127.0.0.1'] } as typeof global.systemEnv;
});
afterEach(() => {
  console.info('[file-url-integration]', JSON.stringify({ requests, peak }));
});
afterAll(async () => {
  timers.forEach(clearTimeout);
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
});

describe('系统文件类型推测：真实 HTTP', () => {
  it('独立于工作流，HEAD 即可返回文件名、后缀和原始链接', async () => {
    const url = `${origin}/document?token=signed`;
    expect(await inferFileTypeFromUrl({ url })).toEqual({
      url,
      filename: 'report.txt',
      extension: '.txt',
      contentType: 'text/plain'
    });
    expect(requests.map(({ method }) => method)).toEqual(['HEAD']);
  });

  it.each(['/large', '/partial'])(
    'GET %s 只读前缀并主动断流，服务端不再发送后续 1 MiB',
    async (route) => {
      const result = await inferFileTypeFromUrl({ url: `${origin}${route}` });
      expect(result.contentType).toBe('image/png');
      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(requests.map(({ method }) => method)).toEqual(['HEAD', 'GET']);
      expect(requests[1]).toMatchObject({ range: 'bytes=0-8191', bytes: 8192 });
      expect(active).toBe(0);
    }
  );

  it('GET 收到响应头后正文停滞，仍在总预算内结束并断开连接', async () => {
    const started = performance.now();
    await expect(
      inferFileTypeFromUrl({ url: `${origin}/stall`, timeoutMs: 150 })
    ).rejects.toThrow();
    expect(performance.now() - started).toBeLessThan(1000);
    expect(requests.map(({ method }) => method)).toEqual(['HEAD', 'GET']);
  });

  it('调用方取消能终止正在等待正文的 GET', async () => {
    const controller = new AbortController();
    const pending = inferFileTypeFromUrl({ url: `${origin}/stall`, signal: controller.signal });
    const rejected = expect(pending).rejects.toThrow();
    await expect.poll(() => requests.filter(({ method }) => method === 'GET').length).toBe(1);
    controller.abort();
    await rejected;
    await expect.poll(() => active).toBe(0);
  });

  it('GET 回退的重定向仍执行域名策略，目标没有收到请求', async () => {
    await expect(
      inferFileTypeFromUrl({
        url: `${origin}/get-redirect`,
        validateUrl: validateFileUrlDomain
      })
    ).rejects.toThrow('Invalid file URL domain');
    expect(requests.map(({ path }) => path)).toEqual(['/get-redirect', '/get-redirect']);
  });
});

describe('真实 HTTP → 工作流 Context → AI/知识库/文件读取', () => {
  it('无后缀图片和文档在登记、AI 多模态消息、知识库输入及实际下载中保持一致', async () => {
    const imageUrl = `${origin}/image`;
    const documentUrl = `${origin}/document`;
    const prepared = await prepare([imageUrl, documentUrl]);
    expect(prepared.query.map((item) => item.file?.type)).toEqual(['image', 'file']);
    await runWithContext({ mcpClientMemory: {}, fileContext: prepared.fileContext }, async () => {
      const files = await getInputFiles({ fileLinks: [imageUrl, documentUrl] });
      const rewritten = await rewriteWorkflowAIUserMessageWithFiles({
        message: { obj: ChatRoleEnum.Human, value: files.map((file) => ({ file })) },
        maxFileAmount: 20
      });
      const messages = chats2GPTMessages({ messages: [rewritten.message], reserveId: false });
      expect(messages[0]?.content).toEqual(
        expect.arrayContaining([{ type: 'image_url', image_url: { url: imageUrl } }])
      );
      expect(await normalizeDatasetSearchInput(['查找相似图片', imageUrl, documentUrl])).toEqual({
        textQueries: ['查找相似图片'],
        imageQueries: [imageUrl]
      });
      expect(
        await normalizeReadableFileUrl({ url: imageUrl, fileContext: prepared.fileContext })
      ).toBe('');
      expect(
        await normalizeReadableFileUrl({ url: documentUrl, fileContext: prepared.fileContext })
      ).toBe(documentUrl);
      expect(requests).toHaveLength(2);
      expect(requests.every(({ method, bytes }) => method === 'HEAD' && bytes === 0)).toBe(true);
      expect(await readWorkflowFileBuffer({ url: imageUrl })).toEqual(png);
      expect(await readWorkflowFileBuffer({ url: documentUrl })).toEqual(textBody);
    });
    expect(requests.map(({ method }) => method)).toEqual(['HEAD', 'HEAD', 'GET', 'GET']);
  });

  it('跟随真实 302，并在重定向目标返回 image/png 后登记为图片', async () => {
    const prepared = await prepare([`${origin}/redirect`]);
    expect(prepared.query[0].file?.type).toBe(ChatFileTypeEnum.image);
    expect(requests.map(({ path }) => path)).toEqual(['/redirect', '/image']);
    expect(requests.every(({ method }) => method === 'HEAD')).toBe(true);
  });

  it('阻止重定向到不在白名单的域名，目标服务没有收到请求', async () => {
    expect(validateFileUrlDomain(`${origin.replace('127.0.0.1', 'localhost.')}/image`)).toBe(false);
    await expect(
      axios.head(`${origin}/blocked-redirect`, {
        __safeAxios: { validateUrl: validateFileUrlDomain }
      } as Parameters<typeof axios.head>[1])
    ).rejects.toThrow('Invalid file URL domain');
    requests.length = 0;
    const prepared = await prepare([`${origin}/blocked-redirect`]);
    expect(prepared.query[0].file?.type).toBe(ChatFileTypeEnum.file);
    expect(requests.map(({ path }) => path)).toEqual(['/blocked-redirect']);
  });

  it('HEAD 405 和通用 MIME 回退 GET，登记图片并供后续节点复用', async () => {
    const prepared = await prepare([`${origin}/no-head`, `${origin}/generic`]);
    expect(prepared.query.map((item) => item.file?.type)).toEqual(['image', 'image']);
    expect(requests.filter(({ method }) => method === 'GET')).toHaveLength(2);
    const count = requests.length;
    await runWithContext({ mcpClientMemory: {}, fileContext: prepared.fileContext }, async () => {
      const files = await getInputFiles({ fileLinks: [`${origin}/no-head`, `${origin}/generic`] });
      expect(files.map(({ type }) => type)).toEqual(['image', 'image']);
      expect(await normalizeDatasetSearchInput([`${origin}/generic`])).toEqual({
        textQueries: [],
        imageQueries: [`${origin}/generic`]
      });
    });
    expect(requests).toHaveLength(count);
  });

  it('HEAD 超时回退 GET，共享约 3 秒的总预算后降级', async () => {
    const started = performance.now();
    const prepared = await prepare([`${origin}/timeout`]);
    const elapsed = performance.now() - started;
    expect(prepared.query[0].file?.type).toBe(ChatFileTypeEnum.file);
    expect(elapsed).toBeGreaterThanOrEqual(2800);
    expect(elapsed).toBeLessThan(5000);
    expect(requests.map(({ method }) => method)).toEqual(['HEAD', 'GET']);
    console.info('[file-url-timeout-ms]', Math.round(elapsed));
  });

  it('去重和截断发生在探测前，重复 fragment 与超限 URL 不发起额外请求', async () => {
    const prepared = await prepare([], 2);
    await runWithContext({ mcpClientMemory: {}, fileContext: prepared.fileContext }, async () => {
      const files = await getInputFiles({
        fileLinks: [
          `${origin}/image#first`,
          `${origin}/image#second`,
          `${origin}/document`,
          'https://blocked.invalid/overflow'
        ]
      });
      expect(files.map(({ type }) => type)).toEqual(['image', 'file']);
    });
    expect(requests.map(({ path }) => path)).toEqual(['/image', '/document']);
  });

  it('同一 Context 的并发消费者共享 HEAD，跨批次并发不超过 5', async () => {
    const prepared = await prepare();
    await runWithContext({ mcpClientMemory: {}, fileContext: prepared.fileContext }, async () => {
      const urls = Array.from({ length: 12 }, (_, i) => `${origin}/delayed-${i}`);
      const [first, second] = await Promise.all([
        getInputFiles({ fileLinks: urls }),
        getInputFiles({ fileLinks: urls })
      ]);
      expect(first).toEqual(second);
      expect(first.every(({ type }) => type === ChatFileTypeEnum.image)).toBe(true);
      expect(requests).toHaveLength(12);
      expect(peak).toBeGreaterThan(1);
      expect(peak).toBeLessThanOrEqual(5);
    });
  });

  it('子工作流复用父级已登记图片，新增文件仅登记在子级', async () => {
    const imageUrl = `${origin}/image`;
    const childUrl = `${origin}/delayed-child`;
    const prepared = await prepare([imageUrl]);
    await runWithContext({ mcpClientMemory: {}, fileContext: prepared.fileContext }, async () => {
      await runWithDerivedWorkflowFileContext({
        files: [imageUrl, childUrl],
        fn: async () => {
          expect(getWorkflowFileContext()).not.toBe(prepared.fileContext);
          const files = await prepareWorkflowFiles({
            files: [{ url: imageUrl }, { url: childUrl }]
          });
          expect(files.map(({ type }) => type)).toEqual(['image', 'image']);
        }
      });
    });
    expect(prepared.fileContext.resolve(childUrl)).toBeUndefined();
    expect(requests.map(({ path }) => path)).toEqual(['/image', '/delayed-child']);
  });

  it('并发消费者共享完整 HEAD/GET 探测，回退期间并发仍不超过 5', async () => {
    const prepared = await prepare();
    await runWithContext({ mcpClientMemory: {}, fileContext: prepared.fileContext }, async () => {
      const urls = Array.from({ length: 12 }, (_, i) => `${origin}/delayed-generic-${i}`);
      const [first, second] = await Promise.all([
        getInputFiles({ fileLinks: urls }),
        getInputFiles({ fileLinks: urls })
      ]);
      expect(first).toEqual(second);
      expect(first.every(({ type }) => type === ChatFileTypeEnum.image)).toBe(true);
      expect(requests.filter(({ method }) => method === 'HEAD')).toHaveLength(12);
      expect(requests.filter(({ method }) => method === 'GET')).toHaveLength(12);
      expect(peak).toBeLessThanOrEqual(5);
    });
  });

  it('已知后缀不触发 HEAD：实际为文本的 .png 仍按图片处理，明确当前识别边界', async () => {
    const prepared = await prepare([`${origin}/misleading.png`]);
    expect(prepared.query[0].file?.type).toBe(ChatFileTypeEnum.image);
    expect(requests).toEqual([]);
    await runWithContext({ mcpClientMemory: {}, fileContext: prepared.fileContext }, async () => {
      expect(await readWorkflowFileBuffer({ url: `${origin}/misleading.png` })).toEqual(textBody);
    });
  });
});
