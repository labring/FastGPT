import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { SystemVersionCache } from '@fastgpt/dal/redis/caches';

const createKeyBatches = async function* (batches: string[][]) {
  for (const batch of batches) {
    yield batch;
  }
};

describe('SystemVersionCache', () => {
  const redis = {
    deleteMany: vi.fn(),
    getOrSet: vi.fn(),
    iterateByPrefix: vi.fn(),
    set: vi.fn()
  };
  const createVersion = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    createVersion.mockReturnValue('version-new');
    redis.deleteMany.mockResolvedValue(undefined);
    redis.getOrSet.mockResolvedValue('version-new');
    redis.iterateByPrefix.mockReturnValue(createKeyBatches([]));
    redis.set.mockResolvedValue(undefined);
  });

  it('atomically initializes permanent base and child keys with the historical format', async () => {
    const commandClient = {
      set: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce('version-existing')
    };
    const adapter = new RedisCacheAdapter({ getCommandClient: () => commandClient as any });
    const cache = new SystemVersionCache({ redis: adapter, createVersion });

    await expect(cache.getOrInitialize({ key: 'modelPermission' })).resolves.toBe('version-new');
    await expect(cache.getOrInitialize({ key: 'modelPermission', id: 'team-1' })).resolves.toBe(
      'version-existing'
    );

    expect(commandClient.set.mock.calls).toEqual([
      ['fastgpt:VERSION_KEY:modelPermission', 'version-new', 'NX', 'GET'],
      ['fastgpt:VERSION_KEY:modelPermission:team-1', 'version-new', 'NX', 'GET']
    ]);
  });

  it('refreshes permanent base and child keys with new versions', async () => {
    createVersion.mockReturnValueOnce('base-version').mockReturnValueOnce('child-version');
    const cache = new SystemVersionCache({ redis: redis as any, createVersion });

    await cache.refresh({ key: 'modelPermission' });
    await cache.refresh({ key: 'modelPermission', id: 'team-1' });

    expect(redis.set.mock.calls).toEqual([
      [{ key: 'VERSION_KEY:modelPermission', value: 'base-version' }],
      [{ key: 'VERSION_KEY:modelPermission:team-1', value: 'child-version' }]
    ]);
  });

  it('scans every page before atomically deleting all discovered child keys', async () => {
    redis.iterateByPrefix.mockReturnValue(
      createKeyBatches([
        ['VERSION_KEY:modelPermission:team-1', 'VERSION_KEY:modelPermission:team-2'],
        ['VERSION_KEY:modelPermission:team-3']
      ])
    );
    const cache = new SystemVersionCache({ redis: redis as any, createVersion });

    await cache.refresh({ key: 'modelPermission', id: '*' });

    expect(redis.iterateByPrefix).toHaveBeenCalledWith({
      prefix: 'VERSION_KEY:modelPermission',
      batchSize: 100
    });
    expect(redis.deleteMany).toHaveBeenCalledWith([
      'VERSION_KEY:modelPermission:team-1',
      'VERSION_KEY:modelPermission:team-2',
      'VERSION_KEY:modelPermission:team-3'
    ]);
    expect(redis.set).not.toHaveBeenCalled();
    expect(createVersion).not.toHaveBeenCalled();
  });

  it('does not issue a delete when wildcard scan has no child keys', async () => {
    const cache = new SystemVersionCache({ redis: redis as any, createVersion });

    await cache.refresh({ key: 'modelPermission', id: '*' });

    expect(redis.deleteMany).not.toHaveBeenCalled();
  });

  it('propagates Redis failures because version consistency is fail-closed', async () => {
    const readError = new Error('read failed');
    const writeError = new Error('write failed');
    redis.getOrSet.mockRejectedValueOnce(readError);
    redis.set.mockRejectedValueOnce(writeError);
    const cache = new SystemVersionCache({ redis: redis as any, createVersion });

    await expect(cache.getOrInitialize({ key: 'modelPermission' })).rejects.toBe(readError);
    await expect(cache.refresh({ key: 'modelPermission' })).rejects.toBe(writeError);
  });

  it('propagates wildcard deletion failures', async () => {
    const error = new Error('delete failed');
    redis.iterateByPrefix.mockReturnValue(
      createKeyBatches([
        ['VERSION_KEY:modelPermission:team-1'],
        ['VERSION_KEY:modelPermission:team-2']
      ])
    );
    redis.deleteMany.mockRejectedValueOnce(error);
    const cache = new SystemVersionCache({ redis: redis as any, createVersion });

    await expect(cache.refresh({ key: 'modelPermission', id: '*' })).rejects.toBe(error);
    expect(redis.deleteMany).toHaveBeenCalledTimes(1);
  });
});
