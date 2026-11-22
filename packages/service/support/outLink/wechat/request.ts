import dns from 'node:dns';
import { Agent } from 'undici';
import {
  createInternalAddressChecker,
  PRIVATE_URL_TEXT
} from '@fastgpt/global/common/system/network';
import type { WechatConnectionErrorType } from '@fastgpt/global/support/outLink/type';

const DEFAULT_ILINK_BASE_URL = 'https://ilinkai.weixin.qq.com';

const ILINK_HOST = new URL(DEFAULT_ILINK_BASE_URL).hostname;
const CDN_DOMAIN = 'cdn.weixin.qq.com';

type WechatEndpoint = 'ilink' | 'media';

export class WechatRequestPolicyError extends Error {
  constructor(public readonly reason: Exclude<WechatConnectionErrorType, 'request_failed'>) {
    super(
      reason === 'private_address'
        ? PRIVATE_URL_TEXT
        : 'WeChat request URL is outside the allowed endpoints'
    );
    this.name = 'WechatRequestPolicyError';
  }
}

const parseWechatUrl = (value: string, endpoint: WechatEndpoint): URL => {
  const url = URL.parse(value);
  if (!url || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) {
    throw new WechatRequestPolicyError('invalid_url');
  }

  const allowedDomain = endpoint === 'ilink' ? ILINK_HOST : CDN_DOMAIN;
  if (url.hostname !== allowedDomain && !url.hostname.endsWith('.' + allowedDomain)) {
    throw new WechatRequestPolicyError('invalid_url');
  }
  return url;
};

/** 校验扫码返回或已保存的 iLink 服务地址，保留微信下发的合法路径前缀。 */
export const getWechatBaseUrl = (value?: string): string => {
  const url = parseWechatUrl(
    value === '' || value === undefined ? DEFAULT_ILINK_BASE_URL : value,
    'ilink'
  );
  if (url.search) throw new WechatRequestPolicyError('invalid_url');
  return url.href.replace(/\/+$/, '');
};

const { isInternalResolvedIP } = createInternalAddressChecker({
  checkInternalIp: () => true,
  nodeEnv: 'production'
});

// 微信请求始终使用已校验的公网地址建连，避免由代理或后续 DNS 查询重新选址。
const wechatDispatcher = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
        if (error) return callback(error, '', 0);
        if (!addresses.length) {
          return callback(new Error('WeChat DNS lookup returned no addresses'), '', 0);
        }
        if (addresses.some(({ address }) => isInternalResolvedIP(address))) {
          return callback(new WechatRequestPolicyError('private_address'), '', 0);
        }
        if (options.all) return callback(null, addresses, 0);
        const { address, family } = addresses[0];
        callback(null, address, family);
      });
    }
  }
});

/** 仅访问指定的微信服务。凭据与媒体请求均禁止重定向。 */
export const fetchWechat = (
  target: { url: string; endpoint: WechatEndpoint },
  init: RequestInit
): Promise<Response> => {
  const url = parseWechatUrl(target.url, target.endpoint);
  const options = { ...init, redirect: 'error' as const, dispatcher: wechatDispatcher };
  return fetch(url.href, options).catch((error: unknown) => {
    // fetch 将建连失败包装在 cause 中，保留可区分的策略拒绝。
    if (error instanceof Error && error.cause instanceof WechatRequestPolicyError) {
      throw error.cause;
    }
    throw error;
  });
};
