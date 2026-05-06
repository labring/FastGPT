import type { IncomingHttpHeaders, IncomingMessage } from 'http';
import ipaddr from 'ipaddr.js';
import proxyaddr from 'proxy-addr';
import { serviceEnv } from '../../env';

type IPAddress = ipaddr.IPv4 | ipaddr.IPv6;

type RequestWithClientIp = {
  headers?: IncomingHttpHeaders;
  socket?: {
    remoteAddress?: string | null;
  };
  connection?: {
    remoteAddress?: string | null;
  };
};

type TrustProxyFn = (addr: string, i: number) => boolean;

const MAX_FORWARDED_FOR_LENGTH = 2048;
const MAX_FORWARDED_FOR_HOPS = 32;

let cachedTrustedProxyIpEnv: string | undefined | null = null;
let cachedTrustedProxyEnableEnv: boolean | undefined | null = null;
let cachedNodeEnv: string | undefined | null = null;
let cachedTrustProxyFn: TrustProxyFn = proxyaddr.compile([]);
let warnedInvalidTrustedProxyIpEnv: string | undefined;

// 不区分大小写读取 header 值；数组类型(如 set-cookie 风格)合并为逗号分隔字符串。
const getHeaderValue = (headers: IncomingHttpHeaders | undefined, key: string) => {
  const value =
    headers?.[key] ??
    Object.entries(headers ?? {}).find(([headerKey]) => headerKey.toLowerCase() === key)?.[1];
  if (Array.isArray(value)) return value.join(',');
  return value;
};

// 剥离 IP 字符串外层的引号、IPv6 方括号以及 IPv4/IPv6 末尾的端口,返回纯地址。
const stripIpWrapper = (rawIp: string) => {
  const ip = rawIp.trim().replace(/^"(.+)"$/, '$1');
  const bracketedIpv6 = ip.match(/^\[([^\]]+)](?::\d+)?$/);
  if (bracketedIpv6?.[1]) return bracketedIpv6[1];

  const ipv4WithPort = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
  if (ipv4WithPort?.[1]) return ipv4WithPort[1];

  return ip;
};

// 将原始字符串解析为 ipaddr.js 的地址对象;非法或为空时返回 null,内部走 ipaddr.process 以归一 IPv4-mapped IPv6。
const parseIpAddress = (rawIp?: string | null): IPAddress | null => {
  if (!rawIp) return null;

  const ip = stripIpWrapper(rawIp);
  if (!ipaddr.isValid(ip)) return null;

  try {
    return ipaddr.process(ip);
  } catch {
    return null;
  }
};

// 校验单条 TRUSTED_PROXY_IPS 配置项是否为合法的 IP 或 CIDR(校验掩码长度与地址族匹配)。
const isValidTrustedProxyAddress = (rawValue: string) => {
  const addressParts = rawValue.trim().split('/');
  if (addressParts.length > 2) return false;

  const [rawAddress, rawPrefixLength] = addressParts;
  const address = parseIpAddress(rawAddress);
  if (!address) return false;
  if (rawPrefixLength === undefined) return true;

  const prefixLength = Number(rawPrefixLength);
  const maxLength = address.kind() === 'ipv4' ? 32 : 128;
  return Number.isInteger(prefixLength) && prefixLength > 0 && prefixLength <= maxLength;
};

// 按逗号/空白拆分 TRUSTED_PROXY_IPS,过滤非法项并去重打印一次警告;非 test 环境下提示运维。
const parseTrustedProxyIpEnv = (trustedProxyIpEnv?: string) => {
  const validAddresses = new Set<string>();
  const invalidAddresses = new Set<string>();

  (trustedProxyIpEnv ?? '')
    .split(/[,\s]+/)
    .filter(Boolean)
    .forEach((item) => {
      if (isValidTrustedProxyAddress(item)) {
        validAddresses.add(item);
      } else {
        invalidAddresses.add(item);
      }
    });

  if (
    invalidAddresses.size > 0 &&
    process.env.NODE_ENV !== 'test' &&
    warnedInvalidTrustedProxyIpEnv !== trustedProxyIpEnv
  ) {
    warnedInvalidTrustedProxyIpEnv = trustedProxyIpEnv;
    console.warn(
      `[security:client-ip] Ignored invalid TRUSTED_PROXY_IPS entries: ${Array.from(
        invalidAddresses
      ).join(', ')}`
    );
  }

  return Array.from(validAddresses);
};

// 构建并缓存 proxy-addr 的信任判定函数;用于 TRUSTED_PROXY_ENABLE=true 的可信代理校验模式。
// 可信代理校验模式下,非生产环境默认信任 loopback,并叠加 TRUSTED_PROXY_IPS 配置。
// 仅当环境变量或 NODE_ENV 变化时才重新编译,避免每次请求都重复解析。
const getTrustProxyFn = () => {
  const trustedProxyEnable = serviceEnv.TRUSTED_PROXY_ENABLE;
  const trustedProxyIpEnv = serviceEnv.TRUSTED_PROXY_IPS;
  const nodeEnv = process.env.NODE_ENV;
  if (
    trustedProxyEnable === cachedTrustedProxyEnableEnv &&
    trustedProxyIpEnv === cachedTrustedProxyIpEnv &&
    nodeEnv === cachedNodeEnv
  ) {
    return cachedTrustProxyFn;
  }

  cachedTrustedProxyEnableEnv = trustedProxyEnable;
  cachedTrustedProxyIpEnv = trustedProxyIpEnv;
  cachedNodeEnv = nodeEnv;

  const trustedProxyAddresses = trustedProxyEnable
    ? [
        ...(nodeEnv === 'production' ? [] : (['loopback'] satisfies proxyaddr.Address[])),
        ...parseTrustedProxyIpEnv(trustedProxyIpEnv)
      ]
    : [];
  cachedTrustProxyFn = proxyaddr.compile(trustedProxyAddresses);

  return cachedTrustProxyFn;
};

// 将地址对象转为小写字符串,统一 IPv6 大小写写法以便比较。
const normalizeIpAddress = (address: IPAddress) => address.toString().toLowerCase();

// 对外:把任意来源的 IP 字符串解析并归一化(去端口/方括号、小写),非法返回 undefined。
export const normalizeClientIp = (rawIp?: string | null) => {
  const address = parseIpAddress(rawIp);
  if (!address) return;

  return normalizeIpAddress(address);
};

// 对外:判断给定 IP 是否在受信代理白名单内,供上游中间件决定是否采纳转发头。
export const isTrustedProxyIp = (rawIp?: string | null) => {
  const ip = normalizeClientIp(rawIp);
  if (!ip) return false;

  return getTrustProxyFn()(ip, 0);
};

// 取 TCP 连接对端地址(socket / 旧版 connection 兜底),作为最可信的回退来源。
const getRemoteIp = (req: RequestWithClientIp) => {
  return normalizeClientIp(req.socket?.remoteAddress ?? req.connection?.remoteAddress);
};

// 读取并归一化 X-Real-IP 头;通常由 Nginx 等单层代理设置为最初客户端 IP。
const getClientIpFromRealIp = (req: RequestWithClientIp) => {
  const xRealIp = getHeaderValue(req.headers, 'x-real-ip');
  return normalizeClientIp(xRealIp);
};

// 读取原始 X-Forwarded-For 头(不解析、不归一),后续校验和 proxy-addr 解析使用。
const getForwardedFor = (req: RequestWithClientIp) => {
  return getHeaderValue(req.headers, 'x-forwarded-for');
};

// 关闭可信代理校验时的兼容模式:直接相信转发头。
// X-Forwarded-For 按行业约定取最左侧 IP;如果不存在或非法,再尝试 X-Real-IP。
const getClientIpFromForwardingHeaders = (req: RequestWithClientIp) => {
  const forwardedFor = getForwardedFor(req);
  if (forwardedFor && forwardedFor.length <= MAX_FORWARDED_FOR_LENGTH) {
    const firstForwardedIp = forwardedFor.split(',')[0]?.trim();
    const ip = normalizeClientIp(firstForwardedIp);
    if (ip) return ip;
  }

  return getClientIpFromRealIp(req);
};

// 在调用 proxy-addr 前对 XFF 做尺寸/跳数/格式预检,防止超长或畸形头造成解析放大攻击。
const isForwardedForSafeToParse = (forwardedFor: string) => {
  if (forwardedFor.length > MAX_FORWARDED_FOR_LENGTH) return false;

  const hops = forwardedFor.split(',').map((hop) => hop.trim());
  return (
    hops.length > 0 &&
    hops.length <= MAX_FORWARDED_FOR_HOPS &&
    hops.every((hop) => Boolean(normalizeClientIp(hop)))
  );
};

// 构造一个最小化的 IncomingMessage 形状对象供 proxy-addr 使用:
// 仅保留经过调用方校验的 XFF 头与指定 remoteAddress,避免外部 header 干扰判定。
const createProxyAddrRequest = (remoteAddress: string, forwardedFor: string) => {
  return {
    headers: {
      'x-forwarded-for': forwardedFor
    },
    socket: {
      remoteAddress
    }
  } as unknown as IncomingMessage;
};

// 对外:从请求中解析出最终客户端 IP。
// 策略:
//   1. TRUSTED_PROXY_ENABLE=false -> 兼容模式,直接相信 X-Forwarded-For / X-Real-IP,再回退远端 IP。
//   2. TRUSTED_PROXY_ENABLE=true -> 可信代理校验模式,先取 socket 远端 IP 作为底线;若不可解析直接返回 undefined。
//   3. 远端不在受信代理列表 -> 直接返回远端 IP,忽略一切转发头(防伪造)。
//   4. 远端可信 -> 优先用 X-Forwarded-For(经安全校验后交给 proxy-addr 沿信任链回溯),
//      否则回退 X-Real-IP;校验失败或转发头本身仍是受信代理时退回远端 IP。
export const getClientIpFromRequest = (req: RequestWithClientIp) => {
  if (!serviceEnv.TRUSTED_PROXY_ENABLE) {
    return getClientIpFromForwardingHeaders(req) ?? getRemoteIp(req);
  }

  const remoteIp = getRemoteIp(req);
  if (!remoteIp) return;

  const trustProxy = getTrustProxyFn();
  if (trustProxy(remoteIp, 0)) {
    const forwardedFor = getForwardedFor(req);
    if (forwardedFor) {
      if (!isForwardedForSafeToParse(forwardedFor)) {
        return remoteIp;
      }

      const forwardedIp = normalizeClientIp(
        proxyaddr(createProxyAddrRequest(remoteIp, forwardedFor), trustProxy)
      );

      if (forwardedIp && forwardedIp !== remoteIp && !trustProxy(forwardedIp, 0)) {
        return forwardedIp;
      }

      return remoteIp;
    }

    const realIp = getClientIpFromRealIp(req);
    return realIp && realIp !== remoteIp && !trustProxy(realIp, 0) ? realIp : remoteIp;
  }

  return remoteIp;
};
