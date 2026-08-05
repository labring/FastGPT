import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIPFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';
import { jsonRes } from '@fastgpt/service/common/response';
import { serviceEnv } from '@fastgpt/service/env';
import { getRedisRuntime, toPhysicalRedisKey } from '@fastgpt/dal/redis/runtime';
import { FREQUENCY_LIMIT_KEY_PREFIX } from '@fastgpt/service/common/system/frequencyLimit/redisFixedWindow';

const originalUseIpLimit = serviceEnv.USE_IP_LIMIT;
const originalTrustedProxyEnable = serviceEnv.TRUSTED_PROXY_ENABLE;

const getIPFrequencyLimitKey = (id: string, ip: string) =>
  toPhysicalRedisKey(`${FREQUENCY_LIMIT_KEY_PREFIX}:ip:${id}:${ip}`);

const getRedisConnection = () => getRedisRuntime().getCommandConnection();

const setUseIpLimit = (value: boolean) => {
  serviceEnv.USE_IP_LIMIT = value;
};

const setTrustedProxyEnable = (value: boolean) => {
  serviceEnv.TRUSTED_PROXY_ENABLE = value;
};

const createRes = () =>
  ({
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    end: vi.fn()
  }) as any;

const createReq = ({
  headers = {},
  remoteAddress
}: {
  headers?: Record<string, string>;
  remoteAddress?: string;
}) =>
  ({
    headers,
    socket: {
      remoteAddress
    }
  }) as any;

describe('useIPFrequencyLimit', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await getRedisConnection().flushdb();
  });

  afterEach(() => {
    setUseIpLimit(originalUseIpLimit);
    setTrustedProxyEnable(originalTrustedProxyEnable);
  });

  it('should enforce IP limit when USE_IP_LIMIT is enabled without force', async () => {
    setUseIpLimit(true);
    const middleware = useIPFrequencyLimit({
      id: 'ip-spoof-test-toggle-enabled',
      seconds: 60,
      limit: 10
    });

    await middleware(
      createReq({
        remoteAddress: '198.51.100.40'
      }),
      createRes()
    );

    const count = await getRedisConnection().get(
      getIPFrequencyLimitKey('ip-spoof-test-toggle-enabled', '198.51.100.40')
    );

    expect(Number(count)).toBe(1);
  });

  it('should skip IP limit when USE_IP_LIMIT is disabled without force', async () => {
    setUseIpLimit(false);
    const middleware = useIPFrequencyLimit({
      id: 'ip-spoof-test-toggle-disabled',
      seconds: 60,
      limit: 10
    });

    await middleware(
      createReq({
        remoteAddress: '198.51.100.41'
      }),
      createRes()
    );

    const count = await getRedisConnection().get(
      getIPFrequencyLimitKey('ip-spoof-test-toggle-disabled', '198.51.100.41')
    );

    expect(count).toBeNull();
  });

  it('should enforce IP limit when force is true even if USE_IP_LIMIT is disabled', async () => {
    setUseIpLimit(false);
    const middleware = useIPFrequencyLimit({
      id: 'ip-spoof-test-toggle-forced',
      seconds: 60,
      limit: 10,
      force: true
    });

    await middleware(
      createReq({
        remoteAddress: '198.51.100.42'
      }),
      createRes()
    );

    const count = await getRedisConnection().get(
      getIPFrequencyLimitKey('ip-spoof-test-toggle-forced', '198.51.100.42')
    );

    expect(Number(count)).toBe(1);
  });

  it('should ignore spoofed forwarding headers from untrusted direct clients', async () => {
    setTrustedProxyEnable(true);

    const middleware = useIPFrequencyLimit({
      id: 'ip-spoof-test-direct',
      seconds: 60,
      limit: 10,
      force: true
    });

    await middleware(
      createReq({
        remoteAddress: '198.51.100.20',
        headers: {
          'x-forwarded-for': '203.0.113.50',
          'x-real-ip': '203.0.113.51'
        }
      }),
      createRes()
    );

    const realIpCount = await getRedisConnection().get(
      getIPFrequencyLimitKey('ip-spoof-test-direct', '198.51.100.20')
    );
    const spoofedIpCount = await getRedisConnection().get(
      getIPFrequencyLimitKey('ip-spoof-test-direct', '203.0.113.50')
    );

    expect(Number(realIpCount)).toBe(1);
    expect(spoofedIpCount).toBeNull();
  });

  it('should use X-Forwarded-For as the limit key when trusted proxy parsing is disabled', async () => {
    setTrustedProxyEnable(false);

    const middleware = useIPFrequencyLimit({
      id: 'ip-spoof-test-compat',
      seconds: 60,
      limit: 10,
      force: true
    });

    await middleware(
      createReq({
        remoteAddress: '172.16.0.119',
        headers: {
          'x-forwarded-for': '60.186.209.23',
          'x-real-ip': '60.186.209.23'
        }
      }),
      createRes()
    );

    const forwardedIpCount = await getRedisConnection().get(
      getIPFrequencyLimitKey('ip-spoof-test-compat', '60.186.209.23')
    );
    const remoteIpCount = await getRedisConnection().get(
      getIPFrequencyLimitKey('ip-spoof-test-compat', '172.16.0.119')
    );

    expect(Number(forwardedIpCount)).toBe(1);
    expect(remoteIpCount).toBeNull();
  });

  it('should use proxy-addr result for trusted proxy forwarding chains', async () => {
    setTrustedProxyEnable(true);

    const middleware = useIPFrequencyLimit({
      id: 'ip-spoof-test-proxy',
      seconds: 60,
      limit: 10,
      force: true
    });

    await middleware(
      createReq({
        remoteAddress: '127.0.0.1',
        headers: {
          'x-forwarded-for': '6.6.6.6, 203.0.113.50'
        }
      }),
      createRes()
    );

    const clientIpCount = await getRedisConnection().get(
      getIPFrequencyLimitKey('ip-spoof-test-proxy', '203.0.113.50')
    );
    const spoofedIpCount = await getRedisConnection().get(
      getIPFrequencyLimitKey('ip-spoof-test-proxy', '6.6.6.6')
    );

    expect(Number(clientIpCount)).toBe(1);
    expect(spoofedIpCount).toBeNull();
  });

  it('should use a shared fail-closed key when client IP cannot be resolved', async () => {
    setTrustedProxyEnable(true);

    const middleware = useIPFrequencyLimit({
      id: 'ip-spoof-test-unknown',
      seconds: 60,
      limit: 10,
      force: true
    });

    await middleware(
      createReq({
        headers: {
          'x-forwarded-for': '203.0.113.50'
        }
      }),
      createRes()
    );

    const unknownCount = await getRedisConnection().get(
      getIPFrequencyLimitKey('ip-spoof-test-unknown', 'unknown')
    );
    const spoofedIpCount = await getRedisConnection().get(
      getIPFrequencyLimitKey('ip-spoof-test-unknown', '203.0.113.50')
    );

    expect(Number(unknownCount)).toBe(1);
    expect(spoofedIpCount).toBeNull();
  });

  it('should block requests after the IP limit is exceeded', async () => {
    const middleware = useIPFrequencyLimit({
      id: 'ip-spoof-test-block',
      seconds: 60,
      limit: 1,
      force: true
    });

    const firstRes = createRes();
    const secondRes = createRes();
    const req = createReq({
      remoteAddress: '198.51.100.30'
    });

    await middleware(req, firstRes);
    await middleware(req, secondRes);

    expect(jsonRes).toHaveBeenCalledTimes(1);
    expect(jsonRes).toHaveBeenCalledWith(
      secondRes,
      expect.objectContaining({
        code: 429
      })
    );
  });

  it('should allow requests when Redis is unavailable', async () => {
    const redis = getRedisConnection();
    vi.mocked(redis.multi).mockImplementationOnce(() => {
      throw new Error('Redis unavailable');
    });

    const middleware = useIPFrequencyLimit({
      id: 'ip-spoof-test-redis-failure',
      seconds: 60,
      limit: 1,
      force: true
    });

    await middleware(createReq({ remoteAddress: '198.51.100.31' }), createRes());

    expect(jsonRes).not.toHaveBeenCalled();
  });
});
