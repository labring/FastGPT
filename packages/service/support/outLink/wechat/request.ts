import dns from 'node:dns';
import { Agent } from 'undici';
import {
  createInternalAddressChecker,
  PRIVATE_URL_TEXT
} from '@fastgpt/global/common/system/network';

const DEFAULT_ILINK_BASE_URL = 'https://ilinkai.weixin.qq.com';

const ILINK_HOST = new URL(DEFAULT_ILINK_BASE_URL).hostname;
const CDN_DOMAIN = 'cdn.weixin.qq.com';

type WechatEndpoint = 'ilink' | 'media';

export class WechatUrlNotAllowedError extends Error {
  constructor() {
    super('WeChat request URL is outside the allowed endpoints');
  }
}

const parseWechatUrl = (value: string, endpoint: WechatEndpoint): URL => {
  const url = URL.parse(value);
  if (!url || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) {
    throw new WechatUrlNotAllowedError();
  }

  const allowedDomain = endpoint === 'ilink' ? ILINK_HOST : CDN_DOMAIN;
  if (url.hostname !== allowedDomain && !url.hostname.endsWith('.' + allowedDomain)) {
    throw new WechatUrlNotAllowedError();
  }
  return url;
};

/** 校验扫码返回或已保存的 iLink 服务地址，保留微信下发的合法路径前缀。 */
export const getWechatBaseUrl = (value?: string): string => {
  const url = parseWechatUrl(
    value === '' || value === undefined ? DEFAULT_ILINK_BASE_URL : value,
    'ilink'
  );
  if (url.search) throw new WechatUrlNotAllowedError();
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
        if (!addresses.length || addresses.some(({ address }) => isInternalResolvedIP(address))) {
          return callback(new Error(PRIVATE_URL_TEXT), '', 0);
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
  return fetch(url.href, options);
};
