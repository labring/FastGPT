import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkRedisHealth: vi.fn(),
  loadModelProviders: vi.fn(),
  runCode: vi.fn(),
  post: vi.fn()
}));

vi.mock('@fastgpt/service/common/redis', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/redis')>()),
  checkRedisHealth: mocks.checkRedisHealth
}));
vi.mock('@fastgpt/service/thirdProvider/fastgptPlugin/model', () => ({
  loadModelProviders: mocks.loadModelProviders
}));
vi.mock('@fastgpt/service/thirdProvider/codeSandbox', () => ({
  codeSandbox: { runCode: mocks.runCode }
}));
vi.mock('@fastgpt/service/common/api/plusRequest', () => ({
  POST: mocks.post
}));

import { S3Buckets } from '@fastgpt/service/common/s3/config/constants';
import { InitialErrorEnum } from '@fastgpt/service/common/system/constants';
import { instrumentationCheck } from '@/service/common/system/health';

describe('instrumentationCheck', () => {
  const publicBucketHealth = vi.fn();
  const privateBucketHealth = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkRedisHealth.mockResolvedValue(undefined);
    mocks.loadModelProviders.mockResolvedValue(undefined);
    mocks.runCode.mockResolvedValue(undefined);
    mocks.post.mockResolvedValue({ auth: true, data: '' });
    publicBucketHealth.mockResolvedValue(undefined);
    privateBucketHealth.mockResolvedValue(undefined);
    global.s3BucketMap = {
      [S3Buckets.public]: { checkBucketHealth: publicBucketHealth },
      [S3Buckets.private]: { checkBucketHealth: privateBucketHealth }
    } as any;
    global.feConfigs = { isPlus: false } as any;
  });

  it('checks Redis before the remaining production dependencies', async () => {
    await expect(instrumentationCheck()).resolves.toBeUndefined();

    expect(mocks.checkRedisHealth).toHaveBeenCalledTimes(1);
    expect(publicBucketHealth).toHaveBeenCalledTimes(1);
    expect(privateBucketHealth).toHaveBeenCalledTimes(1);
    expect(mocks.loadModelProviders).toHaveBeenCalledTimes(1);
    expect(mocks.runCode).toHaveBeenCalledTimes(1);
  });

  it('fails startup when Redis health check fails', async () => {
    mocks.checkRedisHealth.mockRejectedValueOnce(new Error('redis unavailable'));

    await expect(instrumentationCheck()).rejects.toContain(
      `[${InitialErrorEnum.REDIS_ERROR}] Redis: redis unavailable`
    );
    expect(publicBucketHealth).not.toHaveBeenCalled();
  });

  it('reports public and private bucket health failures separately', async () => {
    publicBucketHealth.mockRejectedValueOnce(new Error('public unavailable'));
    await expect(instrumentationCheck()).rejects.toContain(
      `[${InitialErrorEnum.S3_ERROR}] public bucket: public unavailable`
    );

    publicBucketHealth.mockResolvedValueOnce(undefined);
    privateBucketHealth.mockRejectedValueOnce(new Error('private unavailable'));
    await expect(instrumentationCheck()).rejects.toContain(
      `[${InitialErrorEnum.S3_ERROR}] private bucket: private unavailable`
    );
  });

  it('fails startup when model providers cannot be loaded', async () => {
    mocks.loadModelProviders.mockRejectedValueOnce(new Error('plugin unavailable'));

    await expect(instrumentationCheck()).rejects.toContain(
      `[${InitialErrorEnum.PLUGIN_ERROR}]: plugin unavailable`
    );
    expect(mocks.runCode).not.toHaveBeenCalled();
  });

  it('validates the Pro service only for Plus deployments', async () => {
    global.feConfigs = { isPlus: true } as any;
    mocks.post.mockResolvedValueOnce({ auth: false, data: '' });

    await expect(instrumentationCheck()).rejects.toContain(`[${InitialErrorEnum.PRO_ERROR}]`);
    expect(mocks.post).toHaveBeenCalledWith('/health');
  });

  it('treats the sandbox health check as degraded instead of blocking startup', async () => {
    mocks.runCode.mockRejectedValueOnce(new Error('sandbox unavailable'));

    await expect(instrumentationCheck()).resolves.toBeUndefined();
  });
});
