import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAllKeysByPrefix } from '@fastgpt/service/common/redis/scan';

const getScanMock = () => vi.mocked(global.redisClient!.scan);

describe('getAllKeysByPrefix', () => {
  beforeEach(() => {
    getScanMock().mockReset().mockResolvedValue(['0', []]);
  });

  it('collects logical key batches through the DAL adapter', async () => {
    getScanMock()
      .mockResolvedValueOnce(['7', ['fastgpt:session:user:one', 'fastgpt:session:user:two']])
      .mockResolvedValueOnce(['0', ['fastgpt:session:user:three']]);

    await expect(getAllKeysByPrefix('session:user')).resolves.toEqual([
      'session:user:one',
      'session:user:two',
      'session:user:three'
    ]);
    expect(getScanMock()).toHaveBeenNthCalledWith(
      1,
      '0',
      'MATCH',
      'fastgpt:session:user:*',
      'COUNT',
      1000
    );
    expect(getScanMock()).toHaveBeenNthCalledWith(
      2,
      '7',
      'MATCH',
      'fastgpt:session:user:*',
      'COUNT',
      1000
    );
  });

  it('returns an empty list without touching Redis for an empty prefix', async () => {
    await expect(getAllKeysByPrefix('')).resolves.toEqual([]);
    expect(getScanMock()).not.toHaveBeenCalled();
  });

  it('propagates DAL adapter failures', async () => {
    const error = new Error('scan failed');
    getScanMock().mockRejectedValue(error);

    await expect(getAllKeysByPrefix('session:user')).rejects.toMatchObject({
      code: 'REDIS_OPERATION_FAILED',
      cause: error
    });
  });
});
