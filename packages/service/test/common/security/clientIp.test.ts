import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ipaddr from 'ipaddr.js';
import {
  getClientIpFromRequest,
  isTrustedProxyIp,
  normalizeClientIp
} from '@fastgpt/service/common/security/clientIp';
import { serviceEnv } from '@fastgpt/service/env';

const originalTrustedProxyIps = serviceEnv.TRUSTED_PROXY_IPS;
const originalTrustedProxyEnable = serviceEnv.TRUSTED_PROXY_ENABLE;
const originalNodeEnv = process.env.NODE_ENV;

const setTrustedProxyEnable = (value: boolean) => {
  serviceEnv.TRUSTED_PROXY_ENABLE = value;
};

const setTrustedProxyIps = (value?: string) => {
  serviceEnv.TRUSTED_PROXY_IPS = value;
};

const setNodeEnv = (value?: string) => {
  if (value === undefined) {
    delete process.env.NODE_ENV;
    return;
  }

  process.env.NODE_ENV = value;
};

const createReq = ({
  headers = {},
  remoteAddress
}: {
  headers?: Record<string, string | string[]>;
  remoteAddress?: string;
}) =>
  ({
    headers,
    socket: {
      remoteAddress
    }
  }) as any;

describe('clientIp', () => {
  afterEach(() => {
    setTrustedProxyEnable(originalTrustedProxyEnable);
    setTrustedProxyIps(originalTrustedProxyIps);
    setNodeEnv(originalNodeEnv);
  });

  describe('normalizeClientIp', () => {
    it('should normalize IPv4-mapped IPv6 and IP values with ports', () => {
      expect(normalizeClientIp('::ffff:203.0.113.10')).toBe('203.0.113.10');
      expect(normalizeClientIp('203.0.113.10:443')).toBe('203.0.113.10');
      expect(normalizeClientIp('[2001:db8::10]:443')).toBe('2001:db8::10');
    });

    it('should ignore invalid IP values', () => {
      expect(normalizeClientIp('not-an-ip')).toBeUndefined();
      expect(normalizeClientIp('')).toBeUndefined();
    });

    it('should return undefined when ipaddr.process throws despite isValid passing', () => {
      const processSpy = vi.spyOn(ipaddr, 'process').mockImplementation(() => {
        throw new Error('boom');
      });
      try {
        expect(normalizeClientIp('203.0.113.10')).toBeUndefined();
      } finally {
        processSpy.mockRestore();
      }
    });
  });

  describe('isTrustedProxyIp', () => {
    beforeEach(() => {
      setTrustedProxyEnable(true);
    });

    it('should not trust proxies when trusted proxy parsing is disabled', () => {
      setTrustedProxyEnable(false);
      setTrustedProxyIps('127.0.0.1/8, 10.0.0.0/8');

      expect(isTrustedProxyIp('127.0.0.1')).toBe(false);
      expect(isTrustedProxyIp('10.0.0.10')).toBe(false);
    });

    it('should trust loopback proxies by default', () => {
      setTrustedProxyIps(undefined);

      expect(isTrustedProxyIp('127.0.0.1')).toBe(true);
      expect(isTrustedProxyIp('::1')).toBe(true);
      expect(isTrustedProxyIp('10.0.0.1')).toBe(false);
    });

    it('should trust loopback proxies when NODE_ENV is unset on the first call', () => {
      setNodeEnv(undefined);
      setTrustedProxyIps(undefined);

      expect(isTrustedProxyIp('127.0.0.1')).toBe(true);
    });

    it('should trust configured exact IP and CIDR ranges', () => {
      setTrustedProxyIps('10.0.0.10, 172.16.0.0/12');

      expect(isTrustedProxyIp('10.0.0.10')).toBe(true);
      expect(isTrustedProxyIp('172.16.8.1')).toBe(true);
      expect(isTrustedProxyIp('192.168.1.1')).toBe(false);
    });

    it('should ignore invalid and trust-all proxy settings', () => {
      setTrustedProxyIps('not-an-ip, 0.0.0.0/0, 10.0.0.0/8/extra, 10.0.0.10');

      expect(isTrustedProxyIp('203.0.113.50')).toBe(false);
      expect(isTrustedProxyIp('10.0.0.20')).toBe(false);
      expect(isTrustedProxyIp('10.0.0.10')).toBe(true);
    });

    it('should not trust loopback by default in production', () => {
      setNodeEnv('production');
      setTrustedProxyIps(undefined);

      expect(isTrustedProxyIp('127.0.0.1')).toBe(false);
    });

    it('should warn once when TRUSTED_PROXY_IPS contains invalid entries outside test env', () => {
      setNodeEnv('production');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        setTrustedProxyIps('not-an-ip, 10.0.0.10');
        // Trigger lazy compile of the trust function
        expect(isTrustedProxyIp('10.0.0.10')).toBe(true);

        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0]?.[0]).toContain('not-an-ip');
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('should trust explicitly configured loopback proxies in production', () => {
      setNodeEnv('production');
      setTrustedProxyIps('127.0.0.1/8, ::1/128');

      expect(isTrustedProxyIp('127.0.0.1')).toBe(true);
      expect(isTrustedProxyIp('::1')).toBe(true);
    });
  });

  describe('getClientIpFromRequest', () => {
    beforeEach(() => {
      setTrustedProxyEnable(true);
    });

    it('should trust forwarding headers when trusted proxy parsing is disabled', () => {
      setTrustedProxyEnable(false);
      setTrustedProxyIps('127.0.0.1/8, 10.0.0.0/8');

      const ip = getClientIpFromRequest(
        createReq({
          remoteAddress: '127.0.0.1',
          headers: {
            'x-forwarded-for': '203.0.113.50',
            'x-real-ip': '203.0.113.51'
          }
        })
      );

      expect(ip).toBe('203.0.113.50');
    });

    it('should fall back to X-Real-IP in compatibility mode when X-Forwarded-For is invalid', () => {
      setTrustedProxyEnable(false);

      const ip = getClientIpFromRequest(
        createReq({
          remoteAddress: '127.0.0.1',
          headers: {
            'x-forwarded-for': 'not-an-ip',
            'x-real-ip': '203.0.113.51'
          }
        })
      );

      expect(ip).toBe('203.0.113.51');
    });

    it('should use the left-most X-Forwarded-For IP in compatibility mode', () => {
      setTrustedProxyEnable(false);

      const ip = getClientIpFromRequest(
        createReq({
          remoteAddress: '127.0.0.1',
          headers: {
            'x-forwarded-for': '203.0.113.50, 10.0.0.20'
          }
        })
      );

      expect(ip).toBe('203.0.113.50');
    });

    it('should ignore spoofed forwarding headers for direct requests', () => {
      setTrustedProxyIps(undefined);

      const ip = getClientIpFromRequest(
        createReq({
          remoteAddress: '198.51.100.20',
          headers: {
            'x-forwarded-for': '203.0.113.50',
            'x-real-ip': '203.0.113.51'
          }
        })
      );

      expect(ip).toBe('198.51.100.20');
    });

    it('should not trust private network proxies unless configured', () => {
      setTrustedProxyIps(undefined);

      const ip = getClientIpFromRequest(
        createReq({
          remoteAddress: '10.0.0.20',
          headers: {
            'x-forwarded-for': '203.0.113.50'
          }
        })
      );

      expect(ip).toBe('10.0.0.20');
    });

    it('should read forwarding headers from a trusted loopback proxy', () => {
      setTrustedProxyIps(undefined);

      const ip = getClientIpFromRequest(
        createReq({
          remoteAddress: '127.0.0.1',
          headers: {
            'x-forwarded-for': '203.0.113.50'
          }
        })
      );

      expect(ip).toBe('203.0.113.50');
    });

    it('should ignore loopback forwarding headers in production unless the proxy is configured', () => {
      setNodeEnv('production');
      setTrustedProxyIps(undefined);

      const ip = getClientIpFromRequest(
        createReq({
          remoteAddress: '127.0.0.1',
          headers: {
            'x-forwarded-for': '203.0.113.50'
          }
        })
      );

      expect(ip).toBe('127.0.0.1');
    });

    it('should read forwarding headers from explicitly configured loopback proxies in production', () => {
      setNodeEnv('production');
      setTrustedProxyIps('127.0.0.1/8, ::1/128');

      const ip = getClientIpFromRequest(
        createReq({
          remoteAddress: '127.0.0.1',
          headers: {
            'x-forwarded-for': '203.0.113.50'
          }
        })
      );

      expect(ip).toBe('203.0.113.50');
    });

    it('should use the right-most untrusted IP to resist spoofed X-Forwarded-For prefixes', () => {
      const ip = getClientIpFromRequest(
        createReq({
          remoteAddress: '127.0.0.1',
          headers: {
            'x-forwarded-for': '6.6.6.6, 203.0.113.50'
          }
        })
      );

      expect(ip).toBe('203.0.113.50');
    });

    it('should safely normalize repeated X-Forwarded-For headers before using proxy-addr', () => {
      const ip = getClientIpFromRequest(
        createReq({
          remoteAddress: '127.0.0.1',
          headers: {
            'x-forwarded-for': ['6.6.6.6', '203.0.113.50']
          }
        })
      );

      expect(ip).toBe('203.0.113.50');
    });

    it('should resolve forwarding headers case-insensitively', () => {
      const ip = getClientIpFromRequest(
        createReq({
          remoteAddress: '127.0.0.1',
          headers: {
            'X-Forwarded-For': '203.0.113.50'
          }
        })
      );

      expect(ip).toBe('203.0.113.50');
    });

    it('should reject forwarding chains that contain invalid hops', () => {
      expect(
        getClientIpFromRequest(
          createReq({
            remoteAddress: '127.0.0.1',
            headers: {
              'x-forwarded-for': 'not-an-ip, 203.0.113.50'
            }
          })
        )
      ).toBe('127.0.0.1');

      expect(
        getClientIpFromRequest(
          createReq({
            remoteAddress: '127.0.0.1',
            headers: {
              'x-forwarded-for': '203.0.113.50, '
            }
          })
        )
      ).toBe('127.0.0.1');
    });

    it('should fall back to the direct peer when X-Forwarded-For is too long', () => {
      const ip = getClientIpFromRequest(
        createReq({
          remoteAddress: '127.0.0.1',
          headers: {
            'x-forwarded-for': '203.0.113.50,'.repeat(150)
          }
        })
      );

      expect(ip).toBe('127.0.0.1');
    });

    it('should fall back to the direct peer when X-Forwarded-For has too many hops', () => {
      const ip = getClientIpFromRequest(
        createReq({
          remoteAddress: '127.0.0.1',
          headers: {
            'x-forwarded-for': Array.from({ length: 33 }, () => '203.0.113.50').join(',')
          }
        })
      );

      expect(ip).toBe('127.0.0.1');
    });

    it('should peel configured trusted proxy hops from the forwarding chain', () => {
      setTrustedProxyIps('10.0.0.0/8');

      const ip = getClientIpFromRequest(
        createReq({
          remoteAddress: '10.0.0.20',
          headers: {
            'x-forwarded-for': '198.51.100.10, 10.0.0.30'
          }
        })
      );

      expect(ip).toBe('198.51.100.10');
    });

    it('should fall back to the direct peer when the forwarded chain contains only trusted addresses', () => {
      setTrustedProxyIps('10.0.0.0/8');

      const ip = getClientIpFromRequest(
        createReq({
          remoteAddress: '10.0.0.20',
          headers: {
            'x-forwarded-for': '10.0.0.30'
          }
        })
      );

      expect(ip).toBe('10.0.0.20');
    });

    it('should use X-Real-IP only when the direct peer is trusted', () => {
      expect(
        getClientIpFromRequest(
          createReq({
            remoteAddress: '127.0.0.1',
            headers: {
              'x-real-ip': '203.0.113.60'
            }
          })
        )
      ).toBe('203.0.113.60');

      expect(
        getClientIpFromRequest(
          createReq({
            remoteAddress: '198.51.100.20',
            headers: {
              'x-real-ip': '203.0.113.60'
            }
          })
        )
      ).toBe('198.51.100.20');
    });

    it('should not use X-Real-IP when it points to a trusted proxy address', () => {
      setTrustedProxyIps('10.0.0.0/8');

      const ip = getClientIpFromRequest(
        createReq({
          remoteAddress: '10.0.0.20',
          headers: {
            'x-real-ip': '10.0.0.30'
          }
        })
      );

      expect(ip).toBe('10.0.0.20');
    });

    it('should fall back to the trusted peer when forwarding header is invalid', () => {
      const ip = getClientIpFromRequest(
        createReq({
          remoteAddress: '127.0.0.1',
          headers: {
            'x-forwarded-for': 'not-an-ip'
          }
        })
      );

      expect(ip).toBe('127.0.0.1');
    });

    it('should return undefined when the request has no remote address', () => {
      expect(
        getClientIpFromRequest(
          createReq({
            headers: { 'x-forwarded-for': '203.0.113.50' }
          })
        )
      ).toBeUndefined();
    });

    it('should not fall back to X-Real-IP when X-Forwarded-For is present but invalid', () => {
      const ip = getClientIpFromRequest(
        createReq({
          remoteAddress: '127.0.0.1',
          headers: {
            'x-forwarded-for': 'not-an-ip',
            'x-real-ip': '203.0.113.60'
          }
        })
      );

      expect(ip).toBe('127.0.0.1');
    });
  });
});
