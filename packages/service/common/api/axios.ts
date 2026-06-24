import _, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig
} from 'axios';
import { ProxyAgent, type ProxyAgentOptions } from 'proxy-agent';
import { isDevEnv } from '@fastgpt/global/common/system/constants';
import { isInternalAddress, PRIVATE_URL_TEXT } from '../system/utils';
import { isAbsoluteUrl } from '../security/network';
import { SERVICE_LOCAL_HOST } from '../system/tools';

/**
 * 给 shared axios 实例添加 SSRF 防护。
 *
 * 这里同时接管 axios 的重定向逻辑: axios/follow-redirects 的自动跳转发生在
 * request interceptor 之后,如果不手动处理,302 Location 指向内网时不会再次进入
 * isInternalAddress()。因此 safe axios 会强制关闭底层自动跳转,再在 response
 * interceptor 中逐跳解析 Location、复用同一套 SSRF 策略校验后再发起下一跳请求。
 */
const addSSRFInterceptor = (instance: AxiosInstance) => {
  instance.interceptors.request.use(async (config): Promise<InternalAxiosRequestConfig> => {
    const safeConfig = config as SafeRedirectInternalConfig;
    const requestUrl = buildRequestUrl(safeConfig);
    if (!requestUrl) return config;

    if (await isInternalAddress(requestUrl)) {
      return Promise.reject(new Error(PRIVATE_URL_TEXT));
    }

    const maxRedirects =
      safeConfig.__safeRedirect?.maxRedirects ??
      (typeof safeConfig.maxRedirects === 'number'
        ? safeConfig.maxRedirects
        : SAFE_AXIOS_MAX_REDIRECTS);

    const nextConfig: SafeRedirectInternalConfig = {
      ...safeConfig,
      // 禁用底层自动跳转,保留调用方 maxRedirects 语义给手动跳转状态使用。
      maxRedirects: 0,
      validateStatus: getRedirectValidateStatus(safeConfig.validateStatus, maxRedirects),
      __safeRedirect: safeConfig.__safeRedirect ?? {
        count: 0,
        maxRedirects,
        validateStatus: safeConfig.validateStatus
      }
    };

    return nextConfig;
  });

  instance.interceptors.response.use(async (response) => {
    if (!shouldRedirect(response)) return response;

    const config = response.config as SafeRedirectConfig;
    const redirectState = config.__safeRedirect;
    const currentUrl = buildRequestUrl(config);
    // 理论上 request interceptor 会注入状态；缺失时按普通响应返回,避免误处理其它实例响应。
    if (!redirectState || !currentUrl) return response;

    if (redirectState.count >= redirectState.maxRedirects) {
      return Promise.reject(new Error(`Maximum redirects exceeded: ${redirectState.maxRedirects}`));
    }

    const redirectUrl = resolveRedirectUrl(response.headers.location, currentUrl);
    if (await isInternalAddress(redirectUrl)) {
      return Promise.reject(new Error(PRIVATE_URL_TEXT));
    }

    const redirectConfig = getRedirectConfig(config, response, currentUrl, redirectUrl);

    const nextConfig: SafeRedirectConfig = {
      ...redirectConfig,
      validateStatus: redirectState.validateStatus,
      __safeRedirect: {
        ...redirectState,
        count: redirectState.count + 1
      }
    };

    return instance.request(nextConfig);
  });

  return instance;
};

const createProxyAgent = (options?: ProxyAgentOptions) => new ProxyAgent(options);

const SAFE_AXIOS_MAX_REDIRECTS = 5;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

/**
 * 手动重定向状态。
 *
 * count/maxRedirects 用于替代 axios/follow-redirects 的跳转次数控制。
 * validateStatus 保存调用方原始成功状态判定,因为 request interceptor 会临时允许
 * 3xx 进入 response interceptor,最终非重定向响应仍需按调用方语义判断成功/失败。
 */
type SafeRedirectState = {
  count: number;
  maxRedirects: number;
  validateStatus?: AxiosRequestConfig['validateStatus'];
};

type SafeRedirectConfig = AxiosRequestConfig & {
  __safeRedirect?: SafeRedirectState;
};

type SafeRedirectInternalConfig = InternalAxiosRequestConfig & {
  __safeRedirect?: {
    count: number;
    maxRedirects: number;
    validateStatus?: AxiosRequestConfig['validateStatus'];
  };
};

const shouldRedirect = (response: AxiosResponse): boolean =>
  REDIRECT_STATUS_CODES.has(response.status) && typeof response.headers.location === 'string';

/**
 * 按 axios baseURL + url 规则合成实际请求 URL。
 *
 * 失败时返回 undefined,保持旧拦截器对非法/非标准 URL 的宽容行为；
 * 真正的请求错误仍交给 axios 自身处理。
 */
const buildRequestUrl = (config: AxiosRequestConfig): string | undefined => {
  try {
    return new URL(config.url || '', config.baseURL).toString();
  } catch {
    return;
  }
};

/**
 * 解析 Location 头为下一跳绝对 URL,并限制协议。
 *
 * file://、gopher:// 等非 HTTP 协议不能进入后续请求流程,否则 SSRF 防护的
 * 地址策略和 axios 出站语义都会变得不明确。
 */
const resolveRedirectUrl = (location: string, currentUrl: string): string => {
  const redirectUrl = new URL(location, currentUrl);
  if (redirectUrl.protocol !== 'http:' && redirectUrl.protocol !== 'https:') {
    throw new Error(`Unsupported redirect protocol: ${redirectUrl.protocol}`);
  }
  return redirectUrl.toString();
};

/**
 * 生成重定向请求头。
 *
 * 行为对齐 follow-redirects 的安全取向:
 *  - Host 必须丢弃,由下一跳真实目标重新生成
 *  - 301/302 POST 和 303 非 GET/HEAD 转 GET 时,不能继续携带 content-* 请求体头
 *  - 跨 host/protocol 跳转时移除凭证类 header,避免用户配置的密钥被带到新域名
 */
const filterRedirectHeaders = ({
  headers,
  currentUrl,
  redirectUrl,
  shouldSwitchToGet
}: {
  headers: AxiosRequestConfig['headers'];
  currentUrl: string;
  redirectUrl: string;
  shouldSwitchToGet: boolean;
}): AxiosRequestConfig['headers'] => {
  const nextHeaders = { ...(headers as Record<string, any>) };
  const current = new URL(currentUrl);
  const redirect = new URL(redirectUrl);
  const shouldDropSensitiveHeaders =
    current.protocol !== redirect.protocol || current.host !== redirect.host;

  for (const key of Object.keys(nextHeaders)) {
    const normalizedKey = key.toLowerCase();
    if (normalizedKey === 'host') {
      delete nextHeaders[key];
      continue;
    }
    if (shouldSwitchToGet && normalizedKey.startsWith('content-')) {
      delete nextHeaders[key];
      continue;
    }
    if (
      shouldDropSensitiveHeaders &&
      ['authorization', 'cookie', 'proxy-authorization'].includes(normalizedKey)
    ) {
      delete nextHeaders[key];
    }
  }

  return nextHeaders;
};

/**
 * 根据 HTTP 重定向响应构造下一跳请求配置。
 *
 * 仅实现服务端常见 301/302/303/307/308 语义:
 *  - 301/302 且原方法为 POST 时转 GET
 *  - 303 且原方法不是 GET/HEAD 时转 GET
 *  - 307/308 保留原方法和请求体
 */
const getRedirectConfig = (
  config: AxiosRequestConfig,
  response: AxiosResponse,
  currentUrl: string,
  redirectUrl: string
): AxiosRequestConfig => {
  const currentMethod = (config.method || 'get').toUpperCase();
  const shouldSwitchToGet =
    ((response.status === 301 || response.status === 302) && currentMethod === 'POST') ||
    (response.status === 303 && currentMethod !== 'GET' && currentMethod !== 'HEAD');

  return {
    ...config,
    baseURL: undefined,
    url: redirectUrl,
    maxRedirects: 0,
    method: shouldSwitchToGet ? 'GET' : config.method,
    data: shouldSwitchToGet ? undefined : config.data,
    headers: filterRedirectHeaders({
      headers: config.headers,
      currentUrl,
      redirectUrl,
      shouldSwitchToGet
    })
  };
};

/**
 * 临时放行重定向状态码,让 response interceptor 能拿到 3xx 响应并校验 Location。
 *
 * maxRedirects=0 表示调用方明确禁止跟随重定向,此时完全保留调用方 validateStatus,
 * 不把 3xx 转成“成功响应”。
 */
const getRedirectValidateStatus = (
  validateStatus: AxiosRequestConfig['validateStatus'],
  maxRedirects: number
): AxiosRequestConfig['validateStatus'] => {
  if (maxRedirects === 0) {
    return validateStatus;
  }

  return (status) => {
    if (REDIRECT_STATUS_CODES.has(status)) return true;
    return validateStatus ? validateStatus(status) : status >= 200 && status < 300;
  };
};

/**
 * 工作流 HTTP 节点跳过 HTTPS 证书校验专用 agent。
 * 仍复用 ProxyAgent,只调整目标站 TLS 校验策略,避免改变部署环境的代理语义。
 */
export const httpsCertificateIgnoreAgent = createProxyAgent({
  rejectUnauthorized: false
});

export function createProxyAxios(config?: AxiosRequestConfig, ssrfCheck = true) {
  const agent = createProxyAgent();

  const instance = isDevEnv
    ? _.create(config)
    : _.create({
        proxy: false,
        httpAgent: agent,
        httpsAgent: agent,
        ...config
      });

  return ssrfCheck ? addSSRFInterceptor(instance) : instance;
}

/** @see https://github.com/axios/axios/issues/4531 */
export const axios = createProxyAxios();
export const axiosWithoutSSRF = createProxyAxios(undefined, false);

/**
 * 内部相对路径请求专用的 axios 实例:
 *  - baseURL 固定为本机 NextJS API
 *  - 不带 SSRF 拦截器(本机调用必然解析到 localhost,装拦截会把所有合法请求拦死)
 *  - 不复用 safe axios 的 ProxyAgent,保证内部回环不会被外部代理转走
 *
 * 仅在 url 是相对路径时使用;绝对 URL 必须走 safe `axios`。
 */
const internalAxios: AxiosInstance = _.create({
  baseURL: `http://${SERVICE_LOCAL_HOST}`
});

/**
 * 根据 URL 类型自动选择合适的 axios 实例,避免每个调用点重复
 * `isAbsoluteUrl ? safe : raw` 三元。
 *
 *  - 绝对 URL(`http(s)://...` 或 `//...`)→ safe `axios`(SSRF 拦截,拒绝内网/metadata)
 *  - 相对路径(`/api/...` 等)→ `internalAxios`(本机 baseURL,可信内部 API)
 *
 * 用法:
 * ```ts
 * const client = pickOutboundAxios(url);
 * const res = await client.get(url, { responseType: 'arraybuffer' });
 * ```
 */
export const pickOutboundAxios = (url: string): AxiosInstance => {
  return isAbsoluteUrl(url) ? axios : internalAxios;
};
