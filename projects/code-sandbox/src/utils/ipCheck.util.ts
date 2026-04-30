import ipaddr from 'ipaddr.js';
import { isIPv6 } from 'net';
import dns from 'dns/promises';

const isDevEnv = process.env.NODE_ENV === 'development';
const SERVICE_LOCAL_PORT = `${process.env.PORT || 3000}`;
const SERVICE_LOCAL_HOST =
  process.env.HOSTNAME && isIPv6(process.env.HOSTNAME)
    ? `[${process.env.HOSTNAME}]:${SERVICE_LOCAL_PORT}`
    : `${process.env.HOSTNAME || 'localhost'}:${SERVICE_LOCAL_PORT}`;

// 云厂商元数据服务 IP（除 169.254.0.0/16 段外的特殊地址）
// 预先归一化为 ipaddr.js 的 normalizedString 形式以便比对
const METADATA_IPS = new Set<string>(
  [
    '100.100.100.200', // 阿里云
    'fd00:ec2::254' // AWS IPv6
  ].map((ip) => ipaddr.parse(ip).toNormalizedString().toLowerCase())
);

// 云厂商元数据服务主机名（归一化：小写、去尾部点）
const METADATA_HOSTNAMES = new Set<string>([
  'metadata.google.internal',
  'metadata',
  'metadata.tencentyun.com',
  'kubernetes.default.svc',
  'kubernetes.default',
  'kubernetes'
]);

const LOCALHOST_HOSTNAMES = new Set<string>(['localhost']);

/**
 * 把 URL hostname 尝试解析成 ipaddr.js 的地址对象
 *  - 处理 IPv6 方括号
 *  - 处理 IPv4-mapped IPv6 (::ffff:a.b.c.d / ::ffff:xxxx:xxxx) → 解包为 IPv4
 *  - 处理十进制/十六进制/八进制/短点分 IPv4 字面量
 * 非 IP 字面量返回 null
 */
const parseHostAsIP = (rawHostname: string): ipaddr.IPv4 | ipaddr.IPv6 | null => {
  const host = rawHostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host) return null;

  // ipaddr.process 会自动把 IPv4-mapped IPv6 解包为 IPv4，处理常规字面量
  if (ipaddr.isValid(host)) {
    try {
      return ipaddr.process(host);
    } catch {
      return null;
    }
  }

  // ipaddr.js 不支持十进制/十六进制/八进制 IPv4 短写，手动兜底
  const numeric = parseNumericIPv4(host);
  if (numeric) return ipaddr.parse(numeric) as ipaddr.IPv4;

  return null;
};

/**
 * 解析 inet_aton 兼容的 IPv4 字面量：十进制 2852039166、十六进制 0xa9fea9fe、
 * 八进制、1-4 段形式（含 dec/hex/oct 混合）。返回标准点分十进制或 null
 */
const parseNumericIPv4 = (host: string): string | null => {
  const parts = host.split('.');
  if (parts.length === 0 || parts.length > 4) return null;

  const nums: number[] = [];
  for (const part of parts) {
    if (!part) return null;
    let n: number;
    if (/^0x[0-9a-f]+$/i.test(part)) n = parseInt(part, 16);
    else if (/^0[0-7]+$/.test(part)) n = parseInt(part, 8);
    else if (/^\d+$/.test(part)) n = parseInt(part, 10);
    else return null;
    if (!Number.isFinite(n) || n < 0) return null;
    nums.push(n);
  }

  const maxLast = [0xffffffff, 0xffffff, 0xffff, 0xff][parts.length - 1];
  if (nums[nums.length - 1] > maxLast) return null;
  for (let i = 0; i < nums.length - 1; i++) if (nums[i] > 0xff) return null;

  let ipInt = 0;
  for (let i = 0; i < nums.length - 1; i++) ipInt = (ipInt + nums[i]) * 256;
  ipInt += nums[nums.length - 1];
  if (ipInt > 0xffffffff) return null;

  return [(ipInt >>> 24) & 0xff, (ipInt >>> 16) & 0xff, (ipInt >>> 8) & 0xff, ipInt & 0xff].join(
    '.'
  );
};

const normalizeDomain = (rawHostname: string): string =>
  rawHostname
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();

/**
 * ipaddr.js range() 返回的所有非 'unicast' 分类都视为内部地址。
 * 主要范围：private / loopback / linkLocal / uniqueLocal / reserved /
 * multicast / broadcast / unspecified / carrierGradeNat 等
 */
const isInternalIPAddress = (addr: ipaddr.IPv4 | ipaddr.IPv6): boolean => {
  return addr.range() !== 'unicast';
};

/**
 * 对已解析出的 IP 复检（防 DNS rebinding TOCTOU）。
 * 调用方先用 isInternalAddress(url) 通过预检，再用 dns.lookup 拿到将要连接的 IP，
 * 在真正建连前用此函数二次校验，确保两次解析的 IP 都在策略允许范围内。
 */
export const isInternalResolvedIP = (rawIP: string): boolean => {
  if (isDevEnv) return false;
  if (!ipaddr.isValid(rawIP)) return false;
  const addr = ipaddr.process(rawIP);
  if (isMetadataIPAddress(addr)) return true;
  const range = addr.range();
  if (range === 'loopback' || range === 'unspecified') return true;
  const checkFullInternal = process.env.CHECK_INTERNAL_IP === 'true';
  if (checkFullInternal && isInternalIPAddress(addr)) return true;
  return false;
};

/**
 * 元数据端点：
 *  - 169.254.0.0/16 link-local 段全部视为元数据
 *  - 显式列表里的 IP（阿里云 100.100.100.200、AWS IPv6 fd00:ec2::254）
 */
const isMetadataIPAddress = (addr: ipaddr.IPv4 | ipaddr.IPv6): boolean => {
  if (addr.kind() === 'ipv4' && addr.range() === 'linkLocal') return true;
  return METADATA_IPS.has(addr.toNormalizedString().toLowerCase());
};

export const isInternalAddress = async (url: string): Promise<boolean> => {
  if (isDevEnv) return false;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return false;
  }

  const hostDomain = normalizeDomain(parsedUrl.hostname);
  const localHost = SERVICE_LOCAL_HOST.split(':')[0].toLowerCase();

  // 1. localhost / 本机
  if (LOCALHOST_HOSTNAMES.has(hostDomain) || hostDomain === localHost) {
    return true;
  }

  // 2. 云元数据主机名
  if (METADATA_HOSTNAMES.has(hostDomain)) {
    return true;
  }

  // 3. IP 字面量（含各种编码变体）
  const ip = parseHostAsIP(parsedUrl.hostname);
  const checkFullInternal = process.env.CHECK_INTERNAL_IP === 'true';

  if (ip) {
    if (isMetadataIPAddress(ip)) return true;
    // loopback/unspecified 等始终阻止（这些是显而易见的错误配置或攻击）
    const range = ip.range();
    if (range === 'loopback' || range === 'unspecified') return true;
    if (checkFullInternal) return isInternalIPAddress(ip);
    return false;
  }

  // 4. 域名：解析 DNS；元数据命中始终阻止，私有段受 CHECK_INTERNAL_IP 控制
  try {
    const [v4Res, v6Res] = await Promise.allSettled([
      dns.resolve4(hostDomain),
      dns.resolve6(hostDomain)
    ]);
    const resolvedIPs = [
      ...(v4Res.status === 'fulfilled' ? v4Res.value : []),
      ...(v6Res.status === 'fulfilled' ? v6Res.value : [])
    ];

    for (const raw of resolvedIPs) {
      if (!ipaddr.isValid(raw)) continue;
      const addr = ipaddr.process(raw);
      if (isMetadataIPAddress(addr)) return true;
      const r = addr.range();
      if (r === 'loopback' || r === 'unspecified') return true;
      if (checkFullInternal && isInternalIPAddress(addr)) return true;
    }
    return false;
  } catch {
    return false;
  }
};

export const PRIVATE_URL_TEXT = 'Request to private network not allowed';
