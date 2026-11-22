import type { LookupAddress } from 'node:dns';
import { Socket } from 'node:net';
import tls from 'node:tls';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => {
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

  it('does not contact domains outside the media policy', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    expect(() =>
      fetchWechat({ url: 'https://example.invalid/media', endpoint: 'media' }, {})
    ).toThrow('outside the allowed endpoints');
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
      reason: 'private_address'
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
      expect.objectContaining({ redirect: 'error', dispatcher: expect.any(Object) })
    );
  });
});
