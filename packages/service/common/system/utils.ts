import { SERVICE_LOCAL_HOST } from './tools';
import { isIP } from 'net';
import * as dns from 'node:dns/promises';

export const isInternalAddress = async (url: string): Promise<boolean> => {
  const isInternalIPv6 = (ip: string): boolean => {
    // 移除 IPv6 地址中的方括号（如果有）
    const cleanIp = ip.replace(/^\[|\]$/g, '');

    // 检查 IPv4-mapped IPv6 地址（格式：::ffff:xxxx:xxxx）
    // Node.js URL 解析器会将 IPv4 部分转换为十六进制
    const ipv4MappedPattern = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i;
    const ipv4MappedMatch = cleanIp.match(ipv4MappedPattern);

    if (ipv4MappedMatch) {
      // 将十六进制转换回 IPv4 地址
      const hex1 = parseInt(ipv4MappedMatch[1], 16);
      const hex2 = parseInt(ipv4MappedMatch[2], 16);

      // hex1 包含前两个字节，hex2 包含后两个字节
      const byte1 = (hex1 >> 8) & 0xff;
      const byte2 = hex1 & 0xff;
      const byte3 = (hex2 >> 8) & 0xff;
      const byte4 = hex2 & 0xff;

      const ipv4 = `${byte1}.${byte2}.${byte3}.${byte4}`;
      return isInternalIPv4(ipv4);
    }

    // IPv6 内部地址范围
    const internalIPv6Patterns = [
      /^::1$/, // Loopback
      /^::$/, // Unspecified
      /^fe80:/i, // Link-local
      /^fc00:/i, // Unique local address (ULA)
      /^fd00:/i, // Unique local address (ULA)
      /^::ffff:0:0/i, // IPv4-mapped IPv6
      /^::ffff:127\./i, // IPv4-mapped loopback
      /^::ffff:10\./i, // IPv4-mapped private (10.0.0.0/8)
      /^::ffff:172\.(1[6-9]|2[0-9]|3[0-1])\./i, // IPv4-mapped private (172.16.0.0/12)
      /^::ffff:192\.168\./i, // IPv4-mapped private (192.168.0.0/16)
      /^::ffff:169\.254\./i, // IPv4-mapped link-local
      /^::ffff:100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./i // IPv4-mapped shared address space
    ];

    return internalIPv6Patterns.some((pattern) => pattern.test(cleanIp));
  };
  const isInternalIPv4 = (ip: string): boolean => {
    // 验证是否为有效的 IPv4 格式
    const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = ip.match(ipv4Pattern);

    if (!match) {
      return false;
    }

    // 解析 IP 地址的各个部分
    const parts = [
      parseInt(match[1], 10),
      parseInt(match[2], 10),
      parseInt(match[3], 10),
      parseInt(match[4], 10)
    ];

    // 验证每个部分是否在有效范围内 (0-255)
    if (parts.some((part) => part < 0 || part > 255)) {
      return false;
    }

    // 检查是否为内部 IP 地址范围
    return (
      parts[0] === 0 || // 0.0.0.0/8 - Current network
      parts[0] === 10 || // 10.0.0.0/8 - Private network
      parts[0] === 127 || // 127.0.0.0/8 - Loopback
      (parts[0] === 169 && parts[1] === 254) || // 169.254.0.0/16 - Link-local
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || // 172.16.0.0/12 - Private network
      (parts[0] === 192 && parts[1] === 168) || // 192.168.0.0/16 - Private network
      (parts[0] >= 224 && parts[0] <= 239) || // 224.0.0.0/4 - Multicast
      (parts[0] >= 240 && parts[0] <= 255) || // 240.0.0.0/4 - Reserved
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) || // 100.64.0.0/10 - Shared address space
      (parts[0] === 192 && parts[1] === 0 && parts[2] === 0) || // 192.0.0.0/24 - IETF Protocol Assignments
      (parts[0] === 192 && parts[1] === 0 && parts[2] === 2) || // 192.0.2.0/24 - Documentation (TEST-NET-1)
      (parts[0] === 198 && parts[1] === 18) || // 198.18.0.0/15 - Benchmarking
      (parts[0] === 198 && parts[1] === 19) || // 198.18.0.0/15 - Benchmarking
      (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) || // 198.51.100.0/24 - Documentation (TEST-NET-2)
      (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) // 203.0.113.0/24 - Documentation (TEST-NET-3)
    );
  };

  try {
    const parsedUrl = new URL(url);
    // 移除 IPv6 地址的方括号（如果有）
    const hostname = parsedUrl.hostname.replace(/^\[|\]$/g, '');
    const fullUrl = parsedUrl.toString();

    // 1. 检查 localhost 和常见的本地域名变体
    const localhostVariants = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];
    const localHostname = SERVICE_LOCAL_HOST.split(':')[0];

    if (localhostVariants.includes(hostname) || hostname === localHostname) {
      return true;
    }

    // 2. 检查云服务商元数据端点（始终阻止，无论 CHECK_INTERNAL_IP 设置如何）
    const metadataEndpoints = [
      // AWS
      'http://169.254.169.254/',
      'http://[fd00:ec2::254]/',

      // Azure
      'http://169.254.169.254/',

      // GCP
      'http://metadata.google.internal/',
      'http://metadata/',

      // Alibaba Cloud
      'http://100.100.100.200/',

      // Tencent Cloud
      'http://metadata.tencentyun.com/',

      // Huawei Cloud
      'http://169.254.169.254/',

      // Oracle Cloud
      'http://169.254.169.254/',

      // DigitalOcean
      'http://169.254.169.254/',

      // Kubernetes
      'http://kubernetes.default.svc/',
      'https://kubernetes.default.svc/'
    ];

    if (metadataEndpoints.some((endpoint) => fullUrl.startsWith(endpoint))) {
      return true;
    }

    // 3. 如果未启用内部 IP 检查，则不进行进一步检查（保持向后兼容）
    if (process.env.CHECK_INTERNAL_IP !== 'true') {
      return false;
    }

    // 4. 使用 Node.js 的 isIP 函数检测 IP 版本
    const ipVersion = isIP(hostname);

    if (ipVersion === 4) {
      // IPv4 地址检查
      return isInternalIPv4(hostname);
    } else if (ipVersion === 6) {
      // IPv6 地址检查
      return isInternalIPv6(hostname);
    } else {
      // 不是 IP 地址，是域名 - 需要解析
      try {
        // 解析所有 A 和 AAAA 记录
        const [ipv4Addresses, ipv6Addresses] = await Promise.allSettled([
          dns.resolve4(hostname),
          dns.resolve6(hostname)
        ]);

        // 检查所有解析的 IP 是否为内部地址
        const allIPs = [
          ...(ipv4Addresses.status === 'fulfilled' ? ipv4Addresses.value : []),
          ...(ipv6Addresses.status === 'fulfilled' ? ipv6Addresses.value : [])
        ];

        // 如果任何一个解析的 IP 是内部地址，则拒绝
        for (const ip of allIPs) {
          if (isInternalIPv4(ip) || isInternalIPv6(ip)) {
            return true;
          }
        }

        return false;
      } catch (error) {
        return false;
      }
    }
  } catch (error) {
    // URL 解析失败 - 宽松策略:允许访问
    return false;
  }
};
