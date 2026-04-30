/**
 * ipCheck.util 单元测试
 *
 * 覆盖：
 * - isInternalResolvedIP：DNS rebinding TOCTOU 二次校验
 *   - 元数据 IP（169.254.169.254、100.100.100.200、fd00:ec2::254）
 *   - loopback/unspecified（127.0.0.1、0.0.0.0、::1、::）
 *   - 私网（10/172.16/192.168/fd00::/7）受 CHECK_INTERNAL_IP 控制
 *   - 公网 IP 永远放行
 *   - dev 环境直接放行
 *   - 非法 IP 字面量
 *
 * - isInternalAddress：URL 级预检
 *   - localhost / 本机 hostname
 *   - 云元数据主机名（metadata.google.internal、kubernetes.default 等）
 *   - IP 字面量（含 IPv4-mapped、十进制/十六进制/八进制变体）
 *   - 域名 DNS 解析（私网 / 公网 / 元数据）
 *   - 非法 URL 兜底
 *   - dev 环境直接放行
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// 用 vi.hoisted 让 mock 在 import 之前生效
const { resolve4, resolve6 } = vi.hoisted(() => ({
  resolve4: vi.fn<(host: string) => Promise<string[]>>(),
  resolve6: vi.fn<(host: string) => Promise<string[]>>()
}));

vi.mock('dns/promises', () => ({
  default: { resolve4, resolve6 },
  resolve4,
  resolve6
}));

// 注意：模块顶层会读取 process.env.NODE_ENV / HOSTNAME / PORT，
// 必须在 import ipCheck 之前确保环境变量是预期值。
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_CHECK_INTERNAL_IP = process.env.CHECK_INTERNAL_IP;

// 直接 require 在 vi.mock 注册后才 import
let isInternalResolvedIP: typeof import('../../src/utils/ipCheck.util').isInternalResolvedIP;
let isInternalAddress: typeof import('../../src/utils/ipCheck.util').isInternalAddress;

beforeEach(async () => {
  process.env.NODE_ENV = 'production';
  process.env.CHECK_INTERNAL_IP = 'false';
  resolve4.mockReset();
  resolve6.mockReset();
  // 默认所有 DNS 解析失败
  resolve4.mockRejectedValue(new Error('ENODATA'));
  resolve6.mockRejectedValue(new Error('ENODATA'));

  // 每次重新加载，让模块顶层常量按当前 env 重新计算
  vi.resetModules();
  const mod = await import('../../src/utils/ipCheck.util');
  isInternalResolvedIP = mod.isInternalResolvedIP;
  isInternalAddress = mod.isInternalAddress;
});

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  process.env.CHECK_INTERNAL_IP = ORIGINAL_CHECK_INTERNAL_IP;
});

describe('isInternalResolvedIP', () => {
  describe('元数据 IP 永远阻止', () => {
    it('169.254.169.254 (link-local 元数据段)', () => {
      expect(isInternalResolvedIP('169.254.169.254')).toBe(true);
    });
    it('169.254.0.1 (link-local 段任意 IP)', () => {
      expect(isInternalResolvedIP('169.254.0.1')).toBe(true);
    });
    it('100.100.100.200 (阿里云元数据)', () => {
      expect(isInternalResolvedIP('100.100.100.200')).toBe(true);
    });
    it('fd00:ec2::254 (AWS IPv6 元数据)', () => {
      expect(isInternalResolvedIP('fd00:ec2::254')).toBe(true);
    });
  });

  describe('loopback / unspecified 永远阻止', () => {
    it('127.0.0.1', () => {
      expect(isInternalResolvedIP('127.0.0.1')).toBe(true);
    });
    it('127.255.255.255 (loopback 段任意 IP)', () => {
      expect(isInternalResolvedIP('127.255.255.255')).toBe(true);
    });
    it('::1 (IPv6 loopback)', () => {
      expect(isInternalResolvedIP('::1')).toBe(true);
    });
    it('0.0.0.0 (unspecified)', () => {
      expect(isInternalResolvedIP('0.0.0.0')).toBe(true);
    });
    it(':: (IPv6 unspecified)', () => {
      expect(isInternalResolvedIP('::')).toBe(true);
    });
  });

  describe('私网段：CHECK_INTERNAL_IP 控制', () => {
    it('CHECK_INTERNAL_IP=false 时放行 10.0.0.1', async () => {
      process.env.CHECK_INTERNAL_IP = 'false';
      vi.resetModules();
      const mod = await import('../../src/utils/ipCheck.util');
      expect(mod.isInternalResolvedIP('10.0.0.1')).toBe(false);
    });
    it('CHECK_INTERNAL_IP=true 时阻止 10.0.0.1', async () => {
      process.env.CHECK_INTERNAL_IP = 'true';
      vi.resetModules();
      const mod = await import('../../src/utils/ipCheck.util');
      expect(mod.isInternalResolvedIP('10.0.0.1')).toBe(true);
    });
    it('CHECK_INTERNAL_IP=true 时阻止 172.16.0.1', async () => {
      process.env.CHECK_INTERNAL_IP = 'true';
      vi.resetModules();
      const mod = await import('../../src/utils/ipCheck.util');
      expect(mod.isInternalResolvedIP('172.16.0.1')).toBe(true);
    });
    it('CHECK_INTERNAL_IP=true 时阻止 192.168.1.1', async () => {
      process.env.CHECK_INTERNAL_IP = 'true';
      vi.resetModules();
      const mod = await import('../../src/utils/ipCheck.util');
      expect(mod.isInternalResolvedIP('192.168.1.1')).toBe(true);
    });
    it('CHECK_INTERNAL_IP=true 时阻止 IPv6 ULA fc00::1', async () => {
      process.env.CHECK_INTERNAL_IP = 'true';
      vi.resetModules();
      const mod = await import('../../src/utils/ipCheck.util');
      expect(mod.isInternalResolvedIP('fc00::1')).toBe(true);
    });
  });

  describe('公网 IP 永远放行', () => {
    it('1.1.1.1', () => {
      expect(isInternalResolvedIP('1.1.1.1')).toBe(false);
    });
    it('8.8.8.8', () => {
      expect(isInternalResolvedIP('8.8.8.8')).toBe(false);
    });
    it('2001:4860:4860::8888 (Google IPv6 DNS)', () => {
      expect(isInternalResolvedIP('2001:4860:4860::8888')).toBe(false);
    });
  });

  describe('开发环境', () => {
    it('NODE_ENV=development 时放行任何 IP（包括 127.0.0.1）', async () => {
      process.env.NODE_ENV = 'development';
      vi.resetModules();
      const mod = await import('../../src/utils/ipCheck.util');
      expect(mod.isInternalResolvedIP('127.0.0.1')).toBe(false);
      expect(mod.isInternalResolvedIP('169.254.169.254')).toBe(false);
      expect(mod.isInternalResolvedIP('1.1.1.1')).toBe(false);
    });
  });

  describe('非法输入', () => {
    it('空字符串放行', () => {
      expect(isInternalResolvedIP('')).toBe(false);
    });
    it('非 IP 字符串放行', () => {
      expect(isInternalResolvedIP('not-an-ip')).toBe(false);
    });
    it('域名（不是 IP 字面量）放行', () => {
      // 这个函数只校验 IP 字面量，域名走 isInternalAddress
      expect(isInternalResolvedIP('example.com')).toBe(false);
    });
  });
});

describe('isInternalAddress', () => {
  describe('localhost / 本机', () => {
    it('http://localhost 阻止', async () => {
      expect(await isInternalAddress('http://localhost')).toBe(true);
    });
    it('http://localhost:8080 阻止', async () => {
      expect(await isInternalAddress('http://localhost:8080')).toBe(true);
    });
    it('https://localhost/path 阻止', async () => {
      expect(await isInternalAddress('https://localhost/path')).toBe(true);
    });
  });

  describe('云元数据主机名（始终阻止，不受 CHECK_INTERNAL_IP 影响）', () => {
    it('metadata.google.internal', async () => {
      expect(await isInternalAddress('http://metadata.google.internal/')).toBe(true);
    });
    it('metadata.tencentyun.com', async () => {
      expect(await isInternalAddress('http://metadata.tencentyun.com/')).toBe(true);
    });
    it('kubernetes.default.svc', async () => {
      expect(await isInternalAddress('http://kubernetes.default.svc/')).toBe(true);
    });
    it('kubernetes.default', async () => {
      expect(await isInternalAddress('http://kubernetes.default/')).toBe(true);
    });
    it('kubernetes', async () => {
      expect(await isInternalAddress('http://kubernetes/')).toBe(true);
    });
    it('大小写不敏感: METADATA.google.INTERNAL', async () => {
      expect(await isInternalAddress('http://METADATA.google.INTERNAL/')).toBe(true);
    });
    it('尾部点号兼容: metadata.google.internal.', async () => {
      expect(await isInternalAddress('http://metadata.google.internal./')).toBe(true);
    });
  });

  describe('IP 字面量', () => {
    it('http://127.0.0.1 阻止', async () => {
      expect(await isInternalAddress('http://127.0.0.1/')).toBe(true);
    });
    it('http://169.254.169.254 阻止 (AWS metadata)', async () => {
      expect(await isInternalAddress('http://169.254.169.254/')).toBe(true);
    });
    it('http://100.100.100.200 阻止 (阿里云 metadata)', async () => {
      expect(await isInternalAddress('http://100.100.100.200/')).toBe(true);
    });
    it('http://[::1] 阻止 (IPv6 loopback)', async () => {
      expect(await isInternalAddress('http://[::1]/')).toBe(true);
    });
    it('http://[fd00:ec2::254] 阻止 (AWS IPv6 metadata)', async () => {
      expect(await isInternalAddress('http://[fd00:ec2::254]/')).toBe(true);
    });
    it('http://0.0.0.0 阻止 (unspecified)', async () => {
      expect(await isInternalAddress('http://0.0.0.0/')).toBe(true);
    });
    it('CHECK_INTERNAL_IP=false 时放行私网 10.0.0.1', async () => {
      expect(await isInternalAddress('http://10.0.0.1/')).toBe(false);
    });
    it('CHECK_INTERNAL_IP=true 时阻止私网 10.0.0.1', async () => {
      process.env.CHECK_INTERNAL_IP = 'true';
      vi.resetModules();
      const mod = await import('../../src/utils/ipCheck.util');
      expect(await mod.isInternalAddress('http://10.0.0.1/')).toBe(true);
    });
    it('http://1.1.1.1 公网放行', async () => {
      expect(await isInternalAddress('http://1.1.1.1/')).toBe(false);
    });
  });

  describe('IP 字面量绕过变体（必须能识别为内网）', () => {
    it('十进制 IPv4: http://2130706433/ (=127.0.0.1)', async () => {
      expect(await isInternalAddress('http://2130706433/')).toBe(true);
    });
    it('十六进制 IPv4: http://0x7f000001/ (=127.0.0.1)', async () => {
      expect(await isInternalAddress('http://0x7f000001/')).toBe(true);
    });
    it('八进制 IPv4: http://0177.0.0.01/ (=127.0.0.1)', async () => {
      expect(await isInternalAddress('http://0177.0.0.01/')).toBe(true);
    });
    it('短点分形式: http://127.1/ (=127.0.0.1)', async () => {
      expect(await isInternalAddress('http://127.1/')).toBe(true);
    });
    it('IPv4-mapped IPv6: http://[::ffff:127.0.0.1]/', async () => {
      expect(await isInternalAddress('http://[::ffff:127.0.0.1]/')).toBe(true);
    });
    it('元数据十进制: http://2852039166/ (=169.254.169.254)', async () => {
      expect(await isInternalAddress('http://2852039166/')).toBe(true);
    });
  });

  describe('域名 DNS 解析', () => {
    it('解析到公网 IP 放行', async () => {
      resolve4.mockResolvedValue(['1.1.1.1']);
      expect(await isInternalAddress('http://example.com/')).toBe(false);
    });
    it('解析到 loopback 阻止', async () => {
      resolve4.mockResolvedValue(['127.0.0.1']);
      expect(await isInternalAddress('http://evil.com/')).toBe(true);
    });
    it('解析到云元数据 IP 阻止（不需要 CHECK_INTERNAL_IP）', async () => {
      resolve4.mockResolvedValue(['169.254.169.254']);
      expect(await isInternalAddress('http://aws-metadata-rebind.com/')).toBe(true);
    });
    it('CHECK_INTERNAL_IP=false 时解析到私网放行', async () => {
      resolve4.mockResolvedValue(['10.0.0.1']);
      expect(await isInternalAddress('http://intra.example.com/')).toBe(false);
    });
    it('CHECK_INTERNAL_IP=true 时解析到私网阻止', async () => {
      process.env.CHECK_INTERNAL_IP = 'true';
      vi.resetModules();
      const mod = await import('../../src/utils/ipCheck.util');
      resolve4.mockResolvedValue(['10.0.0.1']);
      expect(await mod.isInternalAddress('http://intra.example.com/')).toBe(true);
    });
    it('多 IP 中任意一个内网即阻止（DNS rebinding）', async () => {
      resolve4.mockResolvedValue(['1.1.1.1', '127.0.0.1']);
      expect(await isInternalAddress('http://rebind.example.com/')).toBe(true);
    });
    it('IPv6 解析到 loopback 阻止', async () => {
      resolve6.mockResolvedValue(['::1']);
      expect(await isInternalAddress('http://ipv6evil.com/')).toBe(true);
    });
    it('DNS 解析失败放行（域名不存在等）', async () => {
      resolve4.mockRejectedValue(new Error('ENOTFOUND'));
      resolve6.mockRejectedValue(new Error('ENOTFOUND'));
      expect(await isInternalAddress('http://nonexistent.example.com/')).toBe(false);
    });
  });

  describe('非法输入', () => {
    it('非法 URL 放行', async () => {
      expect(await isInternalAddress('not a url')).toBe(false);
    });
    it('空字符串放行', async () => {
      expect(await isInternalAddress('')).toBe(false);
    });
    it('hostname 含字母不像 IP（例如 host.example）走域名解析', async () => {
      resolve4.mockResolvedValue(['1.1.1.1']);
      expect(await isInternalAddress('http://host.example/')).toBe(false);
    });
    it('数字段含非法字符（如 127.foo.0.1）放行（无法解析为 IP，DNS 也会失败）', async () => {
      resolve4.mockRejectedValue(new Error('ENOTFOUND'));
      resolve6.mockRejectedValue(new Error('ENOTFOUND'));
      expect(await isInternalAddress('http://127.foo.0.1/')).toBe(false);
    });
    it('数字段超过 0xff（如 256.0.0.1）放行（无效 IP）', async () => {
      resolve4.mockRejectedValue(new Error('ENOTFOUND'));
      resolve6.mockRejectedValue(new Error('ENOTFOUND'));
      expect(await isInternalAddress('http://256.0.0.1/')).toBe(false);
    });
    it('IPv4 整数溢出（>0xffffffff）放行', async () => {
      resolve4.mockRejectedValue(new Error('ENOTFOUND'));
      resolve6.mockRejectedValue(new Error('ENOTFOUND'));
      // 2^32 = 4294967296 超过 0xffffffff
      expect(await isInternalAddress('http://4294967296/')).toBe(false);
    });
    it('IPv4 段数过多（5 段）放行', async () => {
      resolve4.mockRejectedValue(new Error('ENOTFOUND'));
      resolve6.mockRejectedValue(new Error('ENOTFOUND'));
      expect(await isInternalAddress('http://1.2.3.4.5/')).toBe(false);
    });
  });

  describe('开发环境', () => {
    it('NODE_ENV=development 时放行所有目标（包括 localhost / metadata）', async () => {
      process.env.NODE_ENV = 'development';
      vi.resetModules();
      const mod = await import('../../src/utils/ipCheck.util');
      expect(await mod.isInternalAddress('http://localhost/')).toBe(false);
      expect(await mod.isInternalAddress('http://127.0.0.1/')).toBe(false);
      expect(await mod.isInternalAddress('http://169.254.169.254/')).toBe(false);
      expect(await mod.isInternalAddress('http://metadata.google.internal/')).toBe(false);
    });
  });
});
