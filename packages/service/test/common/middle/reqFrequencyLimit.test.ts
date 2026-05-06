import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useIPFrequencyLimit } from '@fastgpt/service/common/middle/reqFrequencyLimit';
import { MongoFrequencyLimit } from '@fastgpt/service/common/system/frequencyLimit/schema';
import { jsonRes } from '@fastgpt/service/common/response';

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

  it('should ignore spoofed forwarding headers from untrusted direct clients', async () => {
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

  it('should use proxy-addr result for trusted proxy forwarding chains', async () => {
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
