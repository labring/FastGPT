import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { isInternalAddress } from '@fastgpt/service/common/system/utils';

// Mock dns module
vi.mock('node:dns/promises', () => ({
  default: {
    resolve4: vi.fn(),
    resolve6: vi.fn()
  },
  resolve4: vi.fn(),
  resolve6: vi.fn()
}));

// Import mocked dns after mock setup
import * as dns from 'node:dns/promises';

describe('SSRF Protection - isInternalAddress', () => {
  const originalEnv = process.env.CHECK_INTERNAL_IP;

  beforeEach(() => {
    // 清除所有 mock
    vi.clearAllMocks();
  });

  afterEach(() => {
    // 恢复原始环境变量
    if (originalEnv !== undefined) {
      process.env.CHECK_INTERNAL_IP = originalEnv;
    } else {
      delete process.env.CHECK_INTERNAL_IP;
    }
  });

  describe('Localhost 检查（始终阻止）', () => {
    test('应该阻止 localhost', async () => {
      expect(await isInternalAddress('http://localhost/')).toBe(true);
      expect(await isInternalAddress('http://localhost:8080/')).toBe(true);
      expect(await isInternalAddress('https://localhost/')).toBe(true);
    });

    test('应该阻止 127.0.0.1', async () => {
      expect(await isInternalAddress('http://127.0.0.1/')).toBe(true);
      expect(await isInternalAddress('http://127.0.0.1:8080/')).toBe(true);
      expect(await isInternalAddress('https://127.0.0.1/')).toBe(true);
    });

    test('应该阻止 IPv6 loopback', async () => {
      expect(await isInternalAddress('http://[::1]/')).toBe(true);
      expect(await isInternalAddress('http://[::1]:8080/')).toBe(true);
    });

    test('应该阻止 0.0.0.0', async () => {
      expect(await isInternalAddress('http://0.0.0.0/')).toBe(true);
      expect(await isInternalAddress('http://0.0.0.0:8080/')).toBe(true);
    });
  });

  describe('云元数据端点检查（始终阻止）', () => {
    test('应该阻止 AWS 元数据端点', async () => {
      expect(await isInternalAddress('http://169.254.169.254/latest/meta-data/')).toBe(true);
      expect(await isInternalAddress('http://169.254.169.254/latest/user-data/')).toBe(true);
      expect(await isInternalAddress('http://169.254.169.254/')).toBe(true);
    });

    test('应该阻止 GCP 元数据端点', async () => {
      expect(await isInternalAddress('http://metadata.google.internal/')).toBe(true);
      expect(await isInternalAddress('http://metadata.google.internal/computeMetadata/v1/')).toBe(
        true
      );
      expect(await isInternalAddress('http://metadata/')).toBe(true);
    });

    test('应该阻止 Alibaba Cloud 元数据端点', async () => {
      expect(await isInternalAddress('http://100.100.100.200/')).toBe(true);
      expect(await isInternalAddress('http://100.100.100.200/latest/meta-data/')).toBe(true);
    });

    test('应该阻止 Kubernetes 服务端点', async () => {
      expect(await isInternalAddress('http://kubernetes.default.svc/')).toBe(true);
      expect(await isInternalAddress('https://kubernetes.default.svc/')).toBe(true);
    });
  });

  describe('CHECK_INTERNAL_IP 未设置时（默认行为）', () => {
    beforeEach(() => {
      delete process.env.CHECK_INTERNAL_IP;
    });

    test('应该允许公共 IP 地址', async () => {
      expect(await isInternalAddress('http://8.8.8.8/')).toBe(false);
      expect(await isInternalAddress('http://1.1.1.1/')).toBe(false);
      expect(await isInternalAddress('http://93.184.216.34/')).toBe(false);
    });

    test('应该允许私有 IP 地址（向后兼容）', async () => {
      expect(await isInternalAddress('http://10.0.0.1/')).toBe(false);
      expect(await isInternalAddress('http://172.16.0.1/')).toBe(false);
      expect(await isInternalAddress('http://192.168.1.1/')).toBe(false);
    });

    test('应该允许域名（不进行 DNS 解析）', async () => {
      expect(await isInternalAddress('http://example.com/')).toBe(false);
      expect(await isInternalAddress('https://www.google.com/')).toBe(false);
    });

    test('但仍然阻止 localhost 和元数据端点', async () => {
      expect(await isInternalAddress('http://localhost/')).toBe(true);
      expect(await isInternalAddress('http://127.0.0.1/')).toBe(true);
      expect(await isInternalAddress('http://169.254.169.254/')).toBe(true);
    });
  });

  describe('CHECK_INTERNAL_IP=true 时（启用完整检查）', () => {
    beforeEach(() => {
      process.env.CHECK_INTERNAL_IP = 'true';
    });

    test('应该允许公共 IP 地址', async () => {
      expect(await isInternalAddress('http://8.8.8.8/')).toBe(false);
      expect(await isInternalAddress('http://1.1.1.1/')).toBe(false);
      expect(await isInternalAddress('http://93.184.216.34/')).toBe(false);
    });

    test('应该阻止私有 IPv4 地址 - 10.0.0.0/8', async () => {
      expect(await isInternalAddress('http://10.0.0.1/')).toBe(true);
      expect(await isInternalAddress('http://10.255.255.255/')).toBe(true);
    });

    test('应该阻止私有 IPv4 地址 - 172.16.0.0/12', async () => {
      expect(await isInternalAddress('http://172.16.0.1/')).toBe(true);
      expect(await isInternalAddress('http://172.31.255.255/')).toBe(true);
    });

    test('应该阻止私有 IPv4 地址 - 192.168.0.0/16', async () => {
      expect(await isInternalAddress('http://192.168.0.1/')).toBe(true);
      expect(await isInternalAddress('http://192.168.255.255/')).toBe(true);
    });

    test('应该阻止 link-local 地址 - 169.254.0.0/16', async () => {
      expect(await isInternalAddress('http://169.254.1.1/')).toBe(true);
      expect(await isInternalAddress('http://169.254.169.254/')).toBe(true);
    });

    test('应该阻止 shared address space - 100.64.0.0/10', async () => {
      expect(await isInternalAddress('http://100.64.0.1/')).toBe(true);
      expect(await isInternalAddress('http://100.127.255.255/')).toBe(true);
    });

    test('应该阻止 multicast 地址 - 224.0.0.0/4', async () => {
      expect(await isInternalAddress('http://224.0.0.1/')).toBe(true);
      expect(await isInternalAddress('http://239.255.255.255/')).toBe(true);
    });

    test('应该阻止 reserved 地址 - 240.0.0.0/4', async () => {
      expect(await isInternalAddress('http://240.0.0.1/')).toBe(true);
      expect(await isInternalAddress('http://255.255.255.255/')).toBe(true);
    });

    test('应该阻止 documentation 地址', async () => {
      expect(await isInternalAddress('http://192.0.2.1/')).toBe(true);
      expect(await isInternalAddress('http://198.51.100.1/')).toBe(true);
      expect(await isInternalAddress('http://203.0.113.1/')).toBe(true);
    });

    test('应该阻止 benchmarking 地址 - 198.18.0.0/15', async () => {
      expect(await isInternalAddress('http://198.18.0.1/')).toBe(true);
      expect(await isInternalAddress('http://198.19.255.255/')).toBe(true);
    });

    test('应该阻止 IPv6 link-local 地址', async () => {
      expect(await isInternalAddress('http://[fe80::1]/')).toBe(true);
      expect(await isInternalAddress('http://[fe80::abcd:1234]/')).toBe(true);
    });

    test('应该阻止 IPv6 unique local 地址', async () => {
      expect(await isInternalAddress('http://[fc00::1]/')).toBe(true);
      expect(await isInternalAddress('http://[fd00::1]/')).toBe(true);
    });

    test('应该阻止 IPv6 unspecified 地址', async () => {
      expect(await isInternalAddress('http://[::]/')).toBe(true);
    });

    test('应该阻止 IPv4-mapped IPv6 私有地址', async () => {
      expect(await isInternalAddress('http://[::ffff:10.0.0.1]/')).toBe(true);
      expect(await isInternalAddress('http://[::ffff:192.168.1.1]/')).toBe(true);
      expect(await isInternalAddress('http://[::ffff:127.0.0.1]/')).toBe(true);
    });
  });

  describe('DNS 解析功能测试（CHECK_INTERNAL_IP=true）', () => {
    beforeEach(() => {
      process.env.CHECK_INTERNAL_IP = 'true';
    });

    test('应该阻止解析到私有 IPv4 的域名', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(['10.0.0.1']);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error('No AAAA records'));

      expect(await isInternalAddress('http://internal.example.com/')).toBe(true);
    });

    test('应该阻止解析到 localhost 的域名', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(['127.0.0.1']);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error('No AAAA records'));

      expect(await isInternalAddress('http://localhost.example.com/')).toBe(true);
    });

    test('应该阻止解析到 link-local 的域名', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(['169.254.169.254']);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error('No AAAA records'));

      expect(await isInternalAddress('http://metadata.example.com/')).toBe(true);
    });

    test('应该阻止解析到私有 IPv6 的域名', async () => {
      vi.mocked(dns.resolve4).mockRejectedValue(new Error('No A records'));
      vi.mocked(dns.resolve6).mockResolvedValue(['fc00::1']);

      expect(await isInternalAddress('http://internal-v6.example.com/')).toBe(true);
    });

    test('应该阻止解析到多个 IP 且包含私有 IP 的域名', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(['8.8.8.8', '10.0.0.1', '1.1.1.1']);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error('No AAAA records'));

      expect(await isInternalAddress('http://mixed.example.com/')).toBe(true);
    });

    test('应该允许解析到公共 IP 的域名', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(['8.8.8.8', '1.1.1.1']);
      vi.mocked(dns.resolve6).mockResolvedValue(['2001:4860:4860::8888']);

      expect(await isInternalAddress('http://public.example.com/')).toBe(false);
    });

    test('应该允许 DNS 解析失败的域名（宽松策略）', async () => {
      vi.mocked(dns.resolve4).mockRejectedValue(new Error('DNS resolution failed'));
      vi.mocked(dns.resolve6).mockRejectedValue(new Error('DNS resolution failed'));

      // 修改：DNS 解析失败时返回 false（允许访问）
      expect(await isInternalAddress('http://nonexistent.example.com/')).toBe(false);
    });

    test('应该阻止 DNS 重绑定攻击尝试', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(['127.0.0.1']);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error('No AAAA records'));

      expect(await isInternalAddress('http://127.0.0.1.nip.io/')).toBe(true);
    });

    test('应该阻止 xip.io 类型的域名（解析到私有 IP）', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(['10.0.0.1']);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error('No AAAA records'));

      expect(await isInternalAddress('http://10.0.0.1.xip.io/')).toBe(true);
    });

    test('应该阻止 nip.io 类型的域名（解析到私有 IP）', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(['192.168.1.1']);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error('No AAAA records'));

      expect(await isInternalAddress('http://192.168.1.1.nip.io/')).toBe(true);
    });

    test('应该允许 xip.io 类型的域名（解析到公共 IP）', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(['8.8.8.8']);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error('No AAAA records'));

      expect(await isInternalAddress('http://8.8.8.8.xip.io/')).toBe(false);
    });

    test('应该正确处理只有 IPv6 解析的域名', async () => {
      vi.mocked(dns.resolve4).mockRejectedValue(new Error('No A records'));
      vi.mocked(dns.resolve6).mockResolvedValue(['2001:4860:4860::8888']);

      expect(await isInternalAddress('http://ipv6-only.example.com/')).toBe(false);
    });

    test('应该正确处理 IPv6 link-local 解析', async () => {
      vi.mocked(dns.resolve4).mockRejectedValue(new Error('No A records'));
      vi.mocked(dns.resolve6).mockResolvedValue(['fe80::1']);

      expect(await isInternalAddress('http://link-local.example.com/')).toBe(true);
    });
  });

  describe('边界情况和安全测试', () => {
    beforeEach(() => {
      process.env.CHECK_INTERNAL_IP = 'true';
    });

    test('应该正确处理带端口的 URL', async () => {
      expect(await isInternalAddress('http://10.0.0.1:8080/')).toBe(true);
      expect(await isInternalAddress('http://8.8.8.8:8080/')).toBe(false);
    });

    test('应该正确处理带路径的 URL', async () => {
      expect(await isInternalAddress('http://10.0.0.1/api/v1/users')).toBe(true);
      expect(await isInternalAddress('http://8.8.8.8/api/v1/users')).toBe(false);
    });

    test('应该正确处理带查询参数的 URL', async () => {
      expect(await isInternalAddress('http://10.0.0.1/?param=value')).toBe(true);
      expect(await isInternalAddress('http://8.8.8.8/?param=value')).toBe(false);
    });

    test('应该允许无效的 URL（宽松策略）', async () => {
      // 修改：URL 解析失败时返回 false（允许访问）
      expect(await isInternalAddress('not-a-url')).toBe(false);
      expect(await isInternalAddress('http://')).toBe(false);
      expect(await isInternalAddress('')).toBe(false);
    });

    test('应该正确处理 IPv4 边界值', async () => {
      expect(await isInternalAddress('http://0.0.0.0/')).toBe(true);
      expect(await isInternalAddress('http://255.255.255.255/')).toBe(true);
    });

    test('应该允许无效的 IPv4 地址（宽松策略）', async () => {
      // 这些会被 URL 解析器处理为域名，DNS 解析失败时允许访问
      vi.mocked(dns.resolve4).mockRejectedValue(new Error('Invalid hostname'));
      vi.mocked(dns.resolve6).mockRejectedValue(new Error('Invalid hostname'));

      expect(await isInternalAddress('http://256.1.1.1/')).toBe(false);
      expect(await isInternalAddress('http://1.1.1.256/')).toBe(false);
    });

    test('应该正确处理特殊字符的 URL', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(['8.8.8.8']);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error('No AAAA records'));

      expect(await isInternalAddress('http://example.com/path?query=value#fragment')).toBe(false);
    });

    test('应该正确处理 HTTPS URL', async () => {
      expect(await isInternalAddress('https://10.0.0.1/')).toBe(true);
      expect(await isInternalAddress('https://8.8.8.8/')).toBe(false);
    });
  });

  describe('已知绕过尝试（应该被阻止）', () => {
    beforeEach(() => {
      process.env.CHECK_INTERNAL_IP = 'true';
    });

    test('应该阻止 localhost 变体', async () => {
      expect(await isInternalAddress('http://localhost/')).toBe(true);
      expect(await isInternalAddress('http://127.0.0.1/')).toBe(true);
      expect(await isInternalAddress('http://[::1]/')).toBe(true);
    });

    test('应该阻止通过 DNS 解析的域名绕过尝试', async () => {
      // Mock DNS 解析返回内部 IP
      vi.mocked(dns.resolve4).mockResolvedValue(['127.0.0.1']);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error('No AAAA records'));

      expect(await isInternalAddress('http://127.0.0.1.nip.io/')).toBe(true);
      expect(await isInternalAddress('http://localhost.example.com/')).toBe(true);

      // Mock DNS 解析返回私有 IP
      vi.mocked(dns.resolve4).mockResolvedValue(['10.0.0.1']);
      expect(await isInternalAddress('http://10.0.0.1.xip.io/')).toBe(true);
    });

    test('应该阻止 IPv6 绕过尝试', async () => {
      expect(await isInternalAddress('http://[::1]/')).toBe(true);
      expect(await isInternalAddress('http://[fe80::1]/')).toBe(true);
      expect(await isInternalAddress('http://[fc00::1]/')).toBe(true);
    });

    test('应该阻止 IPv4-mapped IPv6 绕过尝试', async () => {
      expect(await isInternalAddress('http://[::ffff:127.0.0.1]/')).toBe(true);
      expect(await isInternalAddress('http://[::ffff:10.0.0.1]/')).toBe(true);
      expect(await isInternalAddress('http://[::ffff:192.168.1.1]/')).toBe(true);
    });
  });

  describe('性能和稳定性测试', () => {
    test('应该正确处理异常输入', async () => {
      await expect(isInternalAddress('http://localhost/')).resolves.not.toThrow();
      await expect(isInternalAddress('invalid')).resolves.not.toThrow();
      await expect(isInternalAddress('')).resolves.not.toThrow();
      await expect(isInternalAddress('http://')).resolves.not.toThrow();
    });

    test('应该正确处理 DNS 超时', async () => {
      vi.mocked(dns.resolve4).mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
      );
      vi.mocked(dns.resolve6).mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
      );

      // 修改：DNS 超时时返回 false（允许访问）
      expect(await isInternalAddress('http://slow.example.com/')).toBe(false);
    });

    test('应该正确处理空的 DNS 响应', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue([]);
      vi.mocked(dns.resolve6).mockResolvedValue([]);

      expect(await isInternalAddress('http://empty-dns.example.com/')).toBe(false);
    });
  });

  describe('混合场景测试', () => {
    beforeEach(() => {
      process.env.CHECK_INTERNAL_IP = 'true';
    });

    test('应该正确处理同时有公共和私有 IP 的域名', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(['8.8.8.8', '10.0.0.1']);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error('No AAAA records'));

      // 只要有一个私有 IP 就应该阻止
      expect(await isInternalAddress('http://mixed-ips.example.com/')).toBe(true);
    });

    test('应该正确处理 IPv4 和 IPv6 混合解析', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(['8.8.8.8']);
      vi.mocked(dns.resolve6).mockResolvedValue(['fc00::1']);

      // IPv6 是私有地址，应该阻止
      expect(await isInternalAddress('http://dual-stack-private.example.com/')).toBe(true);
    });

    test('应该正确处理 IPv4 和 IPv6 都是公共 IP', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(['8.8.8.8']);
      vi.mocked(dns.resolve6).mockResolvedValue(['2001:4860:4860::8888']);

      expect(await isInternalAddress('http://dual-stack-public.example.com/')).toBe(false);
    });
  });
});
