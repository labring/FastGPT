import http from 'node:http';
import type { AddressInfo } from 'node:net';
import axiosLibrary, { type AxiosAdapter } from 'axios';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
import { getSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/runtime';

vi.hoisted(() => {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'development');
});
const boundary = vi.hoisted(() => ({
  systemParse: vi.fn(async () => ({ rawText: 'system-parse', formatText: 'system-parse' }))
}));
vi.unmock('@fastgpt/service/common/api/axios');
vi.mock('@fastgpt/service/worker/function', () => ({
  readRawContentFromBuffer: boundary.systemParse,
  readRawContentFromSource: boundary.systemParse
}));
vi.mock('@fastgpt/service/support/wallet/usage/controller', () => ({
  createPdfParseUsage: vi.fn()
}));

import { axios, axiosWithoutSSRF } from '@fastgpt/service/common/api/axios';
import { readFileContentByBuffer } from '@fastgpt/service/common/file/read/utils';

/** 保留解析分派、真实厂商客户端、multipart与HTTP；只把明确厂商地址映射到不转发的回环服务。 */
describe.sequential('document provider instance configuration HTTP protocol', () => {
  const originalAdapters = [
    axiosLibrary.defaults.adapter,
    axios.defaults.adapter,
    axiosWithoutSSRF.defaults.adapter
  ];
  const nativeHttpAdapter = axiosLibrary.getAdapter('http');
  const events: { path: string; auth?: string; appId?: string; secret?: string; body: Buffer }[] =
    [];
  const agents = new Set<http.Agent>();
  let server: http.Server;
  let origin: string;
  let phase = 'A';
  let slowAborted = false;

  beforeAll(async () => {
    server = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
      events.push({
        path,
        auth: req.headers.authorization,
        appId: req.headers['x-ti-app-id'] as string,
        secret: req.headers['x-ti-secret-code'] as string,
        body: Buffer.concat(chunks)
      });
      res.setHeader('Content-Type', 'application/json');
      if (path === '/sangfor-slow') {
        const timer = setTimeout(
          () => res.end(JSON.stringify({ pages: 1, markdown: 'late' })),
          1500
        );
        res.once('close', () => {
          clearTimeout(timer);
          slowAborted = !res.writableEnded;
        });
        return;
      }
      const provider = path.startsWith('/custom')
        ? 'customPdf'
        : path.startsWith('/sangfor')
          ? 'sangfor'
          : path.includes('pdf_to_markdown')
            ? 'textin'
            : path.includes('parse/sync')
              ? 'somark'
              : 'doc2x';
      const markdown = `# ${provider}-${phase}`;
      if (path.includes('preupload'))
        res.end(
          JSON.stringify({ code: 'ok', data: { uid: 'owned-doc', url: origin + '/upload' } })
        );
      else if (path === '/upload') res.end('{}');
      else if (path.includes('/parse/status'))
        res.end(
          JSON.stringify({
            code: 'ok',
            data: { status: 'success', result: { pages: [{ md: markdown }, { md: '' }] } }
          })
        );
      else if (provider === 'somark')
        res.end(
          JSON.stringify({
            code: 0,
            data: { metadata: { page_num: 2 }, result: { outputs: { markdown } } }
          })
        );
      else if (provider === 'textin')
        res.end(JSON.stringify({ code: 200, result: { markdown, total_page_number: 2 } }));
      else res.end(JSON.stringify({ pages: 2, markdown }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const loopbackOnly: AxiosAdapter = async (config) => {
      const source = new URL(config.url ?? '', config.baseURL);
      if (
        ![new URL(origin).host, 'somark.ai', 'api.textin.com', 'v2.doc2x.noedgeai.com'].includes(
          source.host
        )
      ) {
        throw new Error('Protocol fixture rejects unowned upstream');
      }
      const agent = new http.Agent();
      agents.add(agent);
      try {
        return await nativeHttpAdapter({
          ...config,
          baseURL: undefined,
          url: origin + source.pathname + source.search,
          proxy: false,
          httpAgent: agent,
          httpsAgent: undefined
        });
      } finally {
        agent.destroy();
        agents.delete(agent);
      }
    };
    axiosLibrary.defaults.adapter = loopbackOnly;
    axios.defaults.adapter = loopbackOnly;
    axiosWithoutSSRF.defaults.adapter = loopbackOnly;
    // 仅此隔离进程允许回环夹具；不更改Dev或生产SSRF策略。
    vi.stubEnv('NODE_ENV', 'development');
  });

  beforeEach(() => {
    global.systemInstanceConfig = resolveSystemInstanceConfig({});
    events.length = 0;
    boundary.systemParse.mockClear();
  });

  afterAll(async () => {
    [axiosLibrary.defaults.adapter, axios.defaults.adapter, axiosWithoutSSRF.defaults.adapter] =
      originalAdapters;
    for (const agent of agents) agent.destroy();
    server?.closeAllConnections();
    if (server)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    vi.unstubAllEnvs();
  });

  it.each(['customPdf', 'somark', 'textin', 'doc2x', 'sangfor'] as const)(
    'uses only selected %s credentials after a snapshot change and reports actual pages times price',
    async (provider) => {
      for (const current of ['A', 'B']) {
        phase = current;
        const config = getSystemInstanceConfig().providers.documentParse;
        config.provider = provider;
        Object.assign(config.customPdf, {
          url: origin + '/custom-' + phase,
          key: 'custom-' + phase,
          somarkApiKey: 'somark-' + phase,
          doc2xKey: 'doc2x-' + phase,
          textinAppId: 'textin-app-' + phase,
          textinSecretCode: 'textin-secret-' + phase,
          price: phase === 'A' ? 3 : 5
        });
        Object.assign(config.sangfor, {
          url: origin + '/sangfor-' + phase,
          key: 'sangfor-' + phase,
          extensions: ' .PDF,docx ',
          timeoutSeconds: 3
        });
        const start = events.length;
        const onPdfParseUsage = vi.fn();
        const result = await readFileContentByBuffer({
          teamId: 'owned-team',
          tmbId: 'owned-member',
          extension: 'PDF',
          encoding: 'utf-8',
          buffer: Buffer.from('%PDF owned fixture'),
          customPdfParse: true,
          onPdfParseUsage
        });
        expect(result.rawText).toBe(`# ${provider}-${phase}`);
        expect(boundary.systemParse).not.toHaveBeenCalled();
        expect(onPdfParseUsage).toHaveBeenCalledWith(
          expect.objectContaining({ pages: 2, totalPoints: phase === 'A' ? 6 : 10 })
        );
        const received = events.slice(start);
        expect(received.length).toBe(provider === 'doc2x' ? 3 : 1);
        const request = received[0];
        if (provider === 'somark') expect(request.body.toString()).toContain('somark-' + phase);
        else if (provider === 'textin')
          expect(request).toMatchObject({
            appId: 'textin-app-' + phase,
            secret: 'textin-secret-' + phase
          });
        else
          expect(request.auth).toBe(
            `Bearer ${provider === 'customPdf' ? 'custom' : provider}-${phase}`
          );
        if (provider === 'customPdf' || provider === 'sangfor')
          expect(request.path).toBe(`/${provider === 'customPdf' ? 'custom' : 'sangfor'}-${phase}`);
        const wire = JSON.stringify(
          received.map((event) => ({ ...event, body: event.body.toString() }))
        );
        for (const other of ['customPdf', 'somark', 'textin', 'doc2x', 'sangfor']) {
          if (other === provider) continue;
          const credential =
            other === 'customPdf' ? 'custom-' : other === 'textin' ? 'textin-secret-' : other + '-';
          expect(wire).not.toContain(credential + phase);
        }
      }
    },
    20000
  );

  it('keeps explicit none and an unselected Sangfor extension on the system-parser boundary', async () => {
    const config = getSystemInstanceConfig().providers.documentParse;
    config.provider = 'none';
    Object.assign(config.customPdf, {
      url: origin + '/custom-A',
      key: 'unselected-private-key',
      somarkApiKey: 'unselected-private-key'
    });
    const read = (extension: string) =>
      readFileContentByBuffer({
        teamId: 'owned-team',
        tmbId: 'owned-member',
        extension,
        encoding: 'utf-8',
        buffer: Buffer.from('owned'),
        customPdfParse: true
      });
    expect((await read('pdf')).rawText).toBe('system-parse');
    config.provider = 'sangfor';
    Object.assign(config.sangfor, {
      url: origin + '/sangfor-A',
      key: 'sangfor',
      extensions: 'docx'
    });
    expect((await read('pdf')).rawText).toBe('system-parse');
    expect(events).toHaveLength(0);
    expect(boundary.systemParse).toHaveBeenCalledTimes(2);
  });

  it('applies the dedicated Sangfor timeout to a real slow HTTP response without falling back', async () => {
    const config = getSystemInstanceConfig().providers.documentParse;
    config.provider = 'sangfor';
    Object.assign(config.sangfor, {
      url: origin + '/sangfor-slow',
      key: 'synthetic-sangfor',
      extensions: 'pdf',
      timeoutSeconds: 1
    });
    slowAborted = false;
    await expect(
      readFileContentByBuffer({
        teamId: 'owned-team',
        tmbId: 'owned-member',
        extension: 'pdf',
        encoding: 'utf-8',
        buffer: Buffer.from('%PDF owned fixture'),
        customPdfParse: true
      })
    ).rejects.toMatchObject({ message: 'pdfParseFailed' });
    await vi.waitFor(() => expect(slowAborted).toBe(true));
    expect(boundary.systemParse).not.toHaveBeenCalled();
    expect(events).toHaveLength(1);
  });
});
