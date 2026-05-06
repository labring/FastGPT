import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIPFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';
import { MongoFrequencyLimit } from '@fastgpt/service/common/system/frequencyLimit/schema';
import { jsonRes } from '@fastgpt/service/common/response';
import { serviceEnv } from '@fastgpt/service/env';

const originalUseIpLimit = serviceEnv.USE_IP_LIMIT;
const originalTrustedProxyEnable = serviceEnv.TRUSTED_PROXY_ENABLE;

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
    await MongoFrequencyLimit.deleteMany({
      eventId: /^ip-qps-limit-ip-spoof-test-/
    });
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

    const record = await MongoFrequencyLimit.findOne({
      eventId: 'ip-qps-limit-ip-spoof-test-toggle-enabled-198.51.100.40'
    }).lean();

    expect(record?.amount).toBe(1);
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

    const record = await MongoFrequencyLimit.findOne({
      eventId: 'ip-qps-limit-ip-spoof-test-toggle-disabled-198.51.100.41'
    }).lean();

    expect(record).toBeNull();
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

    const record = await MongoFrequencyLimit.findOne({
      eventId: 'ip-qps-limit-ip-spoof-test-toggle-forced-198.51.100.42'
    }).lean();

    expect(record?.amount).toBe(1);
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

    const realIpRecord = await MongoFrequencyLimit.findOne({
      eventId: 'ip-qps-limit-ip-spoof-test-direct-198.51.100.20'
    }).lean();
    const spoofedIpRecord = await MongoFrequencyLimit.findOne({
      eventId: 'ip-qps-limit-ip-spoof-test-direct-203.0.113.50'
    }).lean();

    expect(realIpRecord?.amount).toBe(1);
    expect(spoofedIpRecord).toBeNull();
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

    const forwardedIpRecord = await MongoFrequencyLimit.findOne({
      eventId: 'ip-qps-limit-ip-spoof-test-compat-60.186.209.23'
    }).lean();
    const remoteIpRecord = await MongoFrequencyLimit.findOne({
      eventId: 'ip-qps-limit-ip-spoof-test-compat-172.16.0.119'
    }).lean();

    expect(forwardedIpRecord?.amount).toBe(1);
    expect(remoteIpRecord).toBeNull();
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

    const clientIpRecord = await MongoFrequencyLimit.findOne({
      eventId: 'ip-qps-limit-ip-spoof-test-proxy-203.0.113.50'
    }).lean();
    const spoofedIpRecord = await MongoFrequencyLimit.findOne({
      eventId: 'ip-qps-limit-ip-spoof-test-proxy-6.6.6.6'
    }).lean();

    expect(clientIpRecord?.amount).toBe(1);
    expect(spoofedIpRecord).toBeNull();
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

    const unknownRecord = await MongoFrequencyLimit.findOne({
      eventId: 'ip-qps-limit-ip-spoof-test-unknown-unknown'
    }).lean();
    const spoofedIpRecord = await MongoFrequencyLimit.findOne({
      eventId: 'ip-qps-limit-ip-spoof-test-unknown-203.0.113.50'
    }).lean();

    expect(unknownRecord?.amount).toBe(1);
    expect(spoofedIpRecord).toBeNull();
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
});
