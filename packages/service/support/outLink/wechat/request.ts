import dns from 'node:dns';
import { Agent, type ProxyAgent } from 'undici';
import { getProxyForUrl } from 'proxy-from-env';
import { createUndiciOutboundProxyAgent } from '../../../common/proxy/utils';
import { UserError } from '@fastgpt/global/common/error/utils';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import {
  createInternalAddressChecker,
  PRIVATE_URL_TEXT
} from '@fastgpt/global/common/system/network';
import type { WechatConnectionErrorType } from '@fastgpt/global/support/outLink/type';

const DEFAULT_ILINK_BASE_URL = 'https://ilinkai.weixin.qq.com';

const ILINK_HOST = new URL(DEFAULT_ILINK_BASE_URL).hostname;
const CDN_DOMAIN = 'cdn.weixin.qq.com';

type WechatEndpoint = 'ilink' | 'media';

export class WechatRequestPolicyError extends UserError {
  constructor(public readonly reason: Exclude<WechatConnectionErrorType, 'request_failed'>) {
    super(
      reason === 'private_address'
        ? PRIVATE_URL_TEXT
        : 'WeChat request URL is outside the allowed endpoints',
      reason === 'private_address'
        ? i18nT('publish:wechat.error.private_address')
        : i18nT('publish:wechat.error.invalid_url')
    );
    this.name = 'WechatRequestPolicyError';
  }
}

const parseWechatUrl = (value: string, endpoint: WechatEndpoint): URL => {
  const url = URL.parse(value);
  if (!url || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) {
    throw new WechatRequestPolicyError('invalid_url');
  }

  // 微信下发的区域端点需先确认实际使用的域名，再纳入对应白名单。
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

// 直连路径（未配置代理或命中 NO_PROXY）在建连前校验解析出的公网 IP；命中环境代理时交给代理层处理。
const wechatDirectDispatcher = new Agent({
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

const wechatProxyDispatchers = new Map<string, ProxyAgent>();

const getWechatDispatcher = (url: string) => {
  const proxyUrl = getProxyForUrl(url);
  if (!proxyUrl) return wechatDirectDispatcher;

  let dispatcher = wechatProxyDispatchers.get(proxyUrl);
  if (!dispatcher) {
    dispatcher = createUndiciOutboundProxyAgent(proxyUrl);
    wechatProxyDispatchers.set(proxyUrl, dispatcher);
  }
  return dispatcher;
};

/** 仅访问指定的微信服务。凭据与媒体请求均禁止重定向。 */
export const fetchWechat = async (
  target: { url: string; endpoint: WechatEndpoint },
  init: RequestInit
): Promise<Response> => {
  const url = parseWechatUrl(target.url, target.endpoint);
  const options = {
    ...init,
    redirect: 'error' as const,
    dispatcher: getWechatDispatcher(url.href)
  };
  try {
    return await fetch(url.href, options);
  } catch (error) {
    // fetch 将建连失败包装在 cause 中，保留可区分的策略拒绝。
    if (error instanceof Error && error.cause instanceof WechatRequestPolicyError) {
      throw error.cause;
    }
    throw error;
  }
};
