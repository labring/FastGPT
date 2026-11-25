import type { LookupAddress } from 'node:dns';
import net, { Socket } from 'node:net';
import tls from 'node:tls';
import { Agent, ProxyAgent } from 'undici';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ILinkClient } from '@fastgpt/service/support/outLink/wechat/ilinkClient';
import { fetchWechat, getWechatBaseUrl } from '@fastgpt/service/support/outLink/wechat/request';

const mockLookup = vi.hoisted(() => vi.fn());
vi.mock('node:dns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:dns')>();
  return { ...actual, default: { ...actual, lookup: mockLookup } };
});

/** 经过真实 fetch/Undici，停在 TLS 出站边界，记录其 lookup 能交给 TCP 的地址。 */
const observeDialAddresses = (addresses: LookupAddress[]) => {
  mockLookup.mockImplementation((_hostname, _options, callback) => callback(null, addresses));
  const dial = vi.fn();
  vi.spyOn(tls, 'connect').mockImplementation((options: tls.ConnectionOptions | number) => {
    if (typeof options === 'number' || !options.host || !options.lookup) {
      throw new Error('Expected the TLS connector to supply a lookup function');
    }
    const { host, lookup } = options;
    const socket = new tls.TLSSocket(new Socket());
    queueMicrotask(() => {
      lookup(host, { all: true }, (error, resolved) => {
        if (!error) dial(resolved);
        socket.destroy(error ?? new Error('Test stopped before opening a socket'));
      });
    });
    return socket;
  });
  return dial;
};

describe('WeChat request policy', () => {
  beforeEach(() => {
    for (const key of [
      'HTTP_PROXY',
      'http_proxy',
      'HTTPS_PROXY',
      'https_proxy',
      'ALL_PROXY',
      'all_proxy',
      'NO_PROXY',
      'no_proxy',
      'npm_config_http_proxy',
      'npm_config_https_proxy',
      'npm_config_proxy'
    ]) {
      vi.stubEnv(key, '');
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    mockLookup.mockReset();
  });

  it('accepts the official iLink origin and preserves a path prefix', () => {
    expect(getWechatBaseUrl()).toBe('https://ilinkai.weixin.qq.com');
    expect(getWechatBaseUrl('https://ilinkai.weixin.qq.com/account/')).toBe(
      'https://ilinkai.weixin.qq.com/account'
    );
  });

  it('does not contact domains outside the media policy', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(
      fetchWechat({ url: 'https://example.invalid/media', endpoint: 'media' }, {})
    ).rejects.toMatchObject({
      name: 'WechatRequestPolicyError',
      reason: 'invalid_url',
      message: expect.stringContaining('outside the allowed endpoints'),
      displayMessage: 'publish:wechat.error.invalid_url'
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('passes the verified DNS answers to the connector without resolving again', async () => {
    const addresses = [{ address: '1.1.1.1', family: 4 }];
    const dial = observeDialAddresses(addresses);

    await expect(new ILinkClient().getUpdates('')).rejects.toThrow(
      'Test stopped before opening a socket'
    );
    expect(mockLookup).toHaveBeenCalledTimes(1);
    expect(dial).toHaveBeenCalledExactlyOnceWith(addresses);
  });

  it('blocks before dialing when DNS includes a restricted address', async () => {
    const dial = observeDialAddresses([
      { address: '1.1.1.1', family: 4 },
      { address: '198.18.0.1', family: 4 }
    ]);

    await expect(new ILinkClient().getUpdates('')).rejects.toMatchObject({
      name: 'WechatRequestPolicyError',
      reason: 'private_address',
      displayMessage: 'publish:wechat.error.private_address'
    });
    expect(mockLookup).toHaveBeenCalledTimes(1);
    expect(dial).not.toHaveBeenCalled();
  });

  it('uses the public-network dispatcher and prevents redirects for allowed media', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal('fetch', fetch);

    const url = 'https://novac2c.cdn.weixin.qq.com/c2c/media';
    await fetchWechat({ url, endpoint: 'media' }, { redirect: 'follow' });
    expect(fetch).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ redirect: 'error', dispatcher: expect.any(Agent) })
    );
  });

  it('routes WeChat requests through ProxyAgent when an outbound proxy is configured', async () => {
    vi.stubEnv('HTTPS_PROXY', 'http://127.0.0.1:7890');
    const fetch = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal('fetch', fetch);

    const url = 'https://ilinkai.weixin.qq.com/ilink/bot/getupdates';
    await fetchWechat({ url, endpoint: 'ilink' }, { redirect: 'follow' });

    expect(fetch).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ redirect: 'error', dispatcher: expect.any(ProxyAgent) })
    );
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('bypasses the proxy and keeps direct IP checks when NO_PROXY matches', async () => {
    vi.stubEnv('HTTPS_PROXY', 'http://127.0.0.1:7890');
    vi.stubEnv('NO_PROXY', 'ilinkai.weixin.qq.com');
    const fetch = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal('fetch', fetch);

    const url = 'https://ilinkai.weixin.qq.com/ilink/bot/getupdates';
    await fetchWechat({ url, endpoint: 'ilink' }, {});

    const dispatcher = fetch.mock.calls[0]?.[1]?.dispatcher;
    expect(dispatcher).toBeInstanceOf(Agent);
    expect(dispatcher).not.toBeInstanceOf(ProxyAgent);
  });

  it.each(['socks5', 'socks5h'] as const)(
    'delegates target DNS resolution to %s:// proxy without local DNS lookup',
    async (scheme) => {
      mockLookup.mockImplementation((_hostname, _options, callback) =>
        callback(new Error('DNS unavailable'), [])
      );
      const socksTargets: Array<{ atyp: number; host: string; port: number }> = [];
      const socksSockets = new Set<net.Socket>();
      const socksServer = net.createServer((client) => {
        socksSockets.add(client);
        let stage = 0;
        client.on('data', (chunk) => {
          if (stage === 0) {
            stage = 1;
            client.write(Buffer.from([0x05, 0x00]));
          } else if (stage === 1) {
            stage = 2;
            const atyp = chunk[3];
            const hostLen = atyp === 0x03 ? chunk[4] : 0;
            const host = atyp === 0x03 ? chunk.subarray(5, 5 + hostLen).toString('utf8') : '';
            const port = chunk.readUInt16BE(5 + hostLen);
            socksTargets.push({ atyp, host, port });
            // 记录到代理收到的域名和端口后返回通用失败，结束握手。
            client.end(Buffer.from([0x05, 0x01, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
          }
        });
        client.on('close', () => socksSockets.delete(client));
      });
      await new Promise<void>((resolve) => socksServer.listen(0, '127.0.0.1', resolve));
      const socksAddress = socksServer.address();
      if (!socksAddress || typeof socksAddress === 'string') {
        throw new Error('Invalid SOCKS5 server address');
      }

      try {
        vi.stubEnv('ALL_PROXY', `${scheme}://127.0.0.1:${socksAddress.port}`);
        await expect(
          fetchWechat(
            { url: 'https://ilinkai.weixin.qq.com/ilink/bot/getupdates', endpoint: 'ilink' },
            {}
          )
        ).rejects.toThrow();

        expect(socksTargets).toEqual([{ atyp: 0x03, host: 'ilinkai.weixin.qq.com', port: 443 }]);
        expect(mockLookup).not.toHaveBeenCalled();
      } finally {
        for (const s of socksSockets) s.destroy();
        await new Promise<void>((resolve) => socksServer.close(() => resolve()));
      }
    }
  );
});
