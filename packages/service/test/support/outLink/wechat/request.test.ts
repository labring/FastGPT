import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWechat, getWechatBaseUrl } from '@fastgpt/service/support/outLink/wechat/request';

describe('WeChat request policy', () => {
  afterEach(() => vi.unstubAllGlobals());

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
