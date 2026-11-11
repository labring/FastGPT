import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import https from 'node:https';
import net, { type Socket } from 'node:net';
import dns from 'node:dns/promises';
import { httpProxyTestTlsOptions } from '@test/fixtures/http-proxy/tls';
import os from 'node:os';
import { once } from 'node:events';
import { dispatchHttp468Request } from '@fastgpt/service/core/workflow/dispatch/tools/http468';
import {
  ContentTypes,
  NodeInputKeyEnum,
  NodeOutputKeyEnum
} from '@fastgpt/global/core/workflow/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { encryptSecretValue } from '@fastgpt/service/common/secret/utils';
import { serviceEnv } from '@fastgpt/service/env';
import { createProxyAxios } from '@fastgpt/service/common/api/axios';
import { PRIVATE_URL_TEXT } from '@fastgpt/service/common/system/utils';
import { formatToolInputSecrets } from '@fastgpt/service/core/app/tool/secretConfig';
import { HttpNode468 } from '@fastgpt/global/core/workflow/template/system/http468';
import { getWorkflowNodeRunParams } from '@fastgpt/service/core/workflow/dispatch/utils/runtime';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';

const proxyKey = NodeInputKeyEnum.httpProxy;
const proxyEnvKeys = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
  'npm_config_http_proxy',
  'npm_config_https_proxy',
  'npm_config_proxy',
  'npm_config_no_proxy'
];

describe('HTTP node proxy over real sockets', () => {
  const servers: http.Server[] = [];
  const sockets = new Set<Socket>();
  const tlsOptions = httpProxyTestTlsOptions;
  const savedEnv = Object.fromEntries(proxyEnvKeys.map((key) => [key, process.env[key]]));
  const originalCheckInternalIp = serviceEnv.CHECK_INTERNAL_IP;
  const mutableEnv = serviceEnv as { CHECK_INTERNAL_IP: boolean };
  const host = Object.values(os.networkInterfaces())
    .flat()
    .find((item) => item?.family === 'IPv4' && !item.internal)?.address;

  const listen = async (handler: http.RequestListener, secure = false) => {
    const server = secure ? https.createServer(tlsOptions, handler) : http.createServer(handler);
    servers.push(server);
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', () => {});
    });
    server.listen(0, '0.0.0.0');
    await once(server, 'listening');
    const address = server.address();
    if (!host || !address || typeof address === 'string')
      throw new Error('Test needs a non-loopback IPv4 address');
    return `${secure ? 'https' : 'http'}://${host}:${address.port}`;
  };

  const props = (url: string, proxy?: unknown) =>
    ({
      runningAppInfo: { sourceType: ChatSourceTypeEnum.app, sourceId: 'app-1' },
      variableState: { toRuntimeRecord: () => ({}) },
      node: { outputs: [] },
      runtimeNodesMap: new Map(),
      histories: [],
      params: {
        [NodeInputKeyEnum.httpReqUrl]: url,
        [NodeInputKeyEnum.httpMethod]: 'GET',
        [NodeInputKeyEnum.httpContentType]: ContentTypes.none,
        [NodeInputKeyEnum.httpTimeout]: 2,
        ...(proxy === undefined ? {} : { [proxyKey]: proxy })
      }
    }) as Parameters<typeof dispatchHttp468Request>[0];

  beforeEach(() => {
    proxyEnvKeys.forEach((key) => delete process.env[key]);
    mutableEnv.CHECK_INTERNAL_IP = false;
    // 虚拟目标由本地代理响应；地址预检使用稳定的公网 DNS 结果，不依赖外部 DNS。
    vi.spyOn(dns, 'resolve4').mockResolvedValue(['93.184.216.34']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    global.systemEnv = {} as any;
    mutableEnv.CHECK_INTERNAL_IP = originalCheckInternalIp;
    for (const key of proxyEnvKeys) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    sockets.forEach((socket) => socket.destroy());
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.closeAllConnections();
            server.close(() => resolve());
          })
      )
    );
  });

  it('forwards an encrypted node proxy with Basic auth even when NO_PROXY=* and leaves other nodes direct', async () => {
    let targetHits = 0;
    const target = await listen((req, res) => {
      targetHits++;
      expect(req.headers['proxy-authorization']).toBeUndefined();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    });
    const seen: { url?: string; auth?: string }[] = [];
    const proxy = await listen((req, res) => {
      seen.push({ url: req.url, auth: req.headers['proxy-authorization'] });
      const headers = { ...req.headers };
      delete headers['proxy-authorization'];
      const upstream = http.request(req.url!, { method: req.method, headers }, (response) => {
        res.writeHead(response.statusCode!, response.headers);
        response.pipe(res);
      });
      upstream.on('error', () => {
        res.statusCode = 502;
        res.end();
      });
      req.pipe(upstream);
    });
    const proxyWithAuth = proxy.replace('http://', 'http://user:p%40ss@');
    process.env.NO_PROXY = '*';
    process.env.HTTP_PROXY = 'http://127.0.0.1:1';
    const savedNode = {
      ...HttpNode468,
      nodeId: 'http',
      inputs: structuredClone(HttpNode468.inputs)
    } as RuntimeNodeItemType;
    savedNode.inputs.find((input) => input.key === proxyKey)!.value = { value: proxyWithAuth };
    formatToolInputSecrets({ flowNodeType: savedNode.flowNodeType, inputs: savedNode.inputs });
    expect(JSON.stringify(savedNode)).not.toContain('p%40ss');
    const reloaded = JSON.parse(JSON.stringify(savedNode));
    const requestProps = props(`${target}/test?q=1`);
    const savedParams = getWorkflowNodeRunParams({
      node: reloaded,
      runtimeNodesMap: new Map(),
      variableState: requestProps.variableState
    });
    const result = await dispatchHttp468Request(props(`${target}/test?q=1`, savedParams[proxyKey]));
    expect(result.data?.[NodeOutputKeyEnum.httpRawResponse]).toEqual({ ok: true });
    expect(seen).toEqual([
      { url: `${target}/test?q=1`, auth: `Basic ${Buffer.from('user:p@ss').toString('base64')}` }
    ]);
    expect(JSON.stringify(result)).not.toContain('p%40ss');
    const direct = await dispatchHttp468Request(props(`${target}/direct`));
    expect(direct.data?.[NodeOutputKeyEnum.httpRawResponse]).toEqual({ ok: true });
    expect(seen).toHaveLength(1);
    expect(targetHits).toBe(2);
  });

  it.each([false, true])('tunnels HTTPS through a proxy (proxy TLS: %s)', async (secureProxy) => {
    const target = await listen((_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end('{"secure":true}');
    }, true);
    const proxy = await listen((_req, res) => {
      res.statusCode = 500;
      res.end();
    }, secureProxy);
    const proxyServer = servers[servers.length - 1];
    const tunnels: string[] = [];
    proxyServer.on('connect', (req, client, head) => {
      tunnels.push(req.url!);
      const targetUrl = new URL(`https://${req.url}`);
      const upstream = net.connect(Number(targetUrl.port), targetUrl.hostname, () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        upstream.write(head);
        upstream.pipe(client);
        client.pipe(upstream);
      });
      sockets.add(upstream);
      upstream.on('error', () => client.destroy());
      client.on('error', () => upstream.destroy());
    });
    global.systemEnv = { workflowHttpNode: { ignoreHttpsCertificate: true } } as any;
    const result = await dispatchHttp468Request(props(`${target}/secure`, { value: proxy }));
    expect(result.data?.[NodeOutputKeyEnum.httpRawResponse]).toEqual({ secure: true });
    expect(tunnels).toEqual([new URL(target).host]);

    global.systemEnv = {} as any;
    const strict = await dispatchHttp468Request(props(`${target}/strict`, { value: proxy }));
    expect(strict.error).toBeDefined();
    expect(strict.data).toBeUndefined();
  });

  it('keeps the explicit proxy for redirects and strips target credentials across hosts', async () => {
    const seen: { url?: string; auth?: string; cookie?: string; proxyAuth?: string }[] = [];
    const proxy = await listen((req, res) => {
      seen.push({
        url: req.url,
        auth: req.headers.authorization,
        cookie: req.headers.cookie,
        proxyAuth: req.headers['proxy-authorization']
      });
      if (seen.length === 1) {
        res.writeHead(302, { Location: 'http://second.example.test/final' });
        res.end();
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.end('{"redirected":true}');
      }
    });
    const requestProps = props('http://first.example.test/start', {
      value: proxy.replace('http://', 'http://proxy-user:proxy-pass@')
    });
    requestProps.params[NodeInputKeyEnum.httpHeaders] = [
      { key: 'Authorization', type: 'string', value: 'Bearer target-secret' },
      { key: 'Cookie', type: 'string', value: 'session=target-secret' }
    ];
    const result = await dispatchHttp468Request(requestProps);
    expect(result.data?.[NodeOutputKeyEnum.httpRawResponse]).toEqual({ redirected: true });
    expect(seen).toHaveLength(2);
    expect(seen[0].auth).toBe('Bearer target-secret');
    expect(seen[1]).toEqual({
      url: 'http://second.example.test/final',
      auth: undefined,
      cookie: undefined,
      proxyAuth: `Basic ${Buffer.from('proxy-user:proxy-pass').toString('base64')}`
    });
  });

  it.each(['http://127.0.0.1:1234/', 'http://169.254.169.254/latest/meta-data/'])(
    'blocks initial and redirected targets: %s',
    async (blocked) => {
      let hits = 0;
      const proxy = await listen((_req, res) => {
        hits++;
        res.writeHead(302, { Location: blocked });
        res.end();
      });
      const initial = await dispatchHttp468Request(props(blocked, { value: proxy }));
      expect(initial.error).toBeDefined();
      expect(hits).toBe(0);
      const redirect = await dispatchHttp468Request(
        props('http://public.example.test/', { value: proxy })
      );
      expect(redirect.error).toBeDefined();
      expect(hits).toBe(1);
    }
  );

  it.each(['http://localhost:8080', 'http://169.254.169.254:8080'])(
    'rejects forbidden proxy endpoints before sending: %s',
    async (proxy) => {
      const result = await dispatchHttp468Request(
        props('http://public.example.test/', { value: proxy })
      );
      expect(result.error).toBeDefined();
    }
  );

  it('rechecks resolved proxy IPs to reject DNS rebinding', async () => {
    vi.spyOn(dns, 'resolve4').mockResolvedValue(['93.184.216.34']);
    vi.spyOn(dns, 'resolve6').mockResolvedValue([]);
    const lookup = vi
      .spyOn(dns, 'lookup')
      .mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as any);
    const client = createProxyAxios();
    await expect(
      client.get('http://public.example.test', {
        __safeAxios: { proxyUrl: 'http://proxy.example.test:8080' }
      })
    ).rejects.toThrow(PRIVATE_URL_TEXT);
    expect(lookup).toHaveBeenCalledWith('proxy.example.test', { all: true, verbatim: true });
  });

  it.each([
    'socks5://user:private@proxy.example.com:1080',
    'http://user:private@proxy.example.com/path',
    'not a URL',
    { invalid: 'private' }
  ])('rejects invalid proxy configuration without echoing credentials: %j', async (value) => {
    const result = await dispatchHttp468Request(
      props('http://public.example.test/', typeof value === 'string' ? { value } : value)
    );
    expect(result.error?.[NodeOutputKeyEnum.error]).toContain('HTTP proxy must be');
    expect(JSON.stringify(result)).not.toContain('private');
  });

  it('preserves HTTP error status and response without exposing proxy agent configuration', async () => {
    const proxy = await listen((_req, res) => {
      res.writeHead(407, { 'Content-Type': 'application/json' });
      res.end('{"detail":"authentication required"}');
    });
    const result = await dispatchHttp468Request(
      props('http://public.example.test/', {
        value: proxy.replace('http://', 'http://user:private@')
      })
    );
    expect(result.error?.[NodeOutputKeyEnum.httpRawError]).toMatchObject({
      status: 407,
      data: { detail: 'authentication required' }
    });
    expect(JSON.stringify(result)).not.toContain('private');
    expect(JSON.stringify(result.rawError)).not.toContain('__safeAxios');
  });

  it('does not fall back to a direct request when the configured proxy is unavailable', async () => {
    let targetHits = 0;
    const target = await listen((_req, res) => {
      targetHits++;
      res.end('direct');
    });
    const proxy = await listen((_req, res) => res.end());
    const server = servers.pop()!;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const result = await dispatchHttp468Request(props(target, { value: proxy }));
    expect(result.error).toBeDefined();
    expect(targetHits).toBe(0);
  });

  it('retains request timeouts with an explicit proxy', async () => {
    const proxy = await listen((_req, _res) => {});
    const requestProps = props('http://public.example.test/', encryptSecretValue({ value: proxy }));
    requestProps.params[NodeInputKeyEnum.httpTimeout] = 0.05;
    const result = await dispatchHttp468Request(requestProps);
    expect(result.error?.[NodeOutputKeyEnum.httpRawError]).toMatchObject({ code: 'ECONNABORTED' });
  });

  it('preserves POST method and JSON bytes through a 307 proxy redirect', async () => {
    const seen: { url?: string; method?: string; body: string }[] = [];
    const proxy = await listen((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        seen.push({ url: req.url, method: req.method, body: Buffer.concat(chunks).toString() });
        if (seen.length === 1) {
          res.writeHead(307, { Location: 'http://public.example.test/final' });
          res.end();
        } else {
          res.setHeader('Content-Type', 'application/json');
          res.end('{"ok":true}');
        }
      });
    });
    const requestProps = props('http://public.example.test/start', { value: proxy });
    requestProps.params[NodeInputKeyEnum.httpMethod] = 'POST';
    requestProps.params[NodeInputKeyEnum.httpContentType] = ContentTypes.json;
    requestProps.params[NodeInputKeyEnum.httpJsonBody] = '{"value":"中文"}';
    const result = await dispatchHttp468Request(requestProps);
    expect(result.data?.[NodeOutputKeyEnum.httpRawResponse]).toEqual({ ok: true });
    expect(seen).toEqual([
      { url: 'http://public.example.test/start', method: 'POST', body: '{"value":"中文"}' },
      { url: 'http://public.example.test/final', method: 'POST', body: '{"value":"中文"}' }
    ]);
  });

  it('uses TLS to an HTTPS proxy for an HTTP target', async () => {
    const seen: string[] = [];
    const proxy = await listen((req, res) => {
      seen.push(req.url!);
      res.end('TLS proxy');
    }, true);
    // 只在此测试中信任自签名代理证书；生产默认仍校验证书。
    const response = await createProxyAxios().get('http://public.example.test/', {
      __safeAxios: { proxyUrl: proxy, rejectUnauthorized: false }
    });
    expect(response.data).toBe('TLS proxy');
    expect(seen).toEqual(['http://public.example.test/']);
  });

  it.each([undefined, { value: '' }])(
    'retains environment proxy behavior when the node proxy is empty: %j',
    async (value) => {
      let hits = 0;
      const proxy = await listen((_req, res) => {
        hits++;
        res.end('environment proxy');
      });
      process.env.HTTP_PROXY = proxy;
      const result = await dispatchHttp468Request(props('http://public.example.test/', value));
      expect(result.data?.[NodeOutputKeyEnum.httpRawResponse]).toBe('environment proxy');
      expect(hits).toBe(1);
    }
  );
});
