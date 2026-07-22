import { describe, expect, it, vi } from 'vitest';
import { createVitestStorageMock } from '../../src/testing/vitestMock';
import { removeIntegrationBucketIfExists } from '../integration/helpers';

describe('removeIntegrationBucketIfExists', () => {
  it('does nothing when the stable test bucket does not exist', async () => {
    const storage = createVitestStorageMock({ vi });
    const bucketExists = vi.fn().mockResolvedValue(false);
    const deleteBucket = vi.fn();

    await removeIntegrationBucketIfExists({ storage, bucketExists, deleteBucket });

    expect(storage.listObjects).not.toHaveBeenCalled();
    expect(deleteBucket).not.toHaveBeenCalled();
  });

  it('deletes an existing empty bucket', async () => {
    const storage = createVitestStorageMock({ vi });
    const deleteBucket = vi.fn().mockResolvedValue(undefined);

    await removeIntegrationBucketIfExists({
      storage,
      bucketExists: vi.fn().mockResolvedValue(true),
      deleteBucket
    });

    expect(storage.listObjects).toHaveBeenCalledWith({});
    expect(storage.deleteObjectsByMultiKeys).not.toHaveBeenCalled();
    expect(deleteBucket).toHaveBeenCalledOnce();
  });

  it('clears every object before deleting an existing bucket', async () => {
    const storage = createVitestStorageMock({ vi });
    storage.__putObject('first.txt', { body: Buffer.from('first') });
    storage.__putObject('nested/second.txt', { body: Buffer.from('second') });
    const deleteBucket = vi.fn().mockResolvedValue(undefined);

    await removeIntegrationBucketIfExists({
      storage,
      bucketExists: vi.fn().mockResolvedValue(true),
      deleteBucket
    });

    expect(storage.deleteObjectsByMultiKeys).toHaveBeenCalledWith({
      keys: ['first.txt', 'nested/second.txt']
    });
    expect(storage.__objects.size).toBe(0);
    expect(deleteBucket).toHaveBeenCalledOnce();
  });

  it('keeps the bucket when any object deletion fails', async () => {
    const storage = createVitestStorageMock({ vi });
    storage.__putObject('failed.txt', { body: Buffer.from('failed') });
    vi.spyOn(storage, 'deleteObjectsByMultiKeys').mockResolvedValue({
      bucket: storage.bucketName,
      keys: ['failed.txt']
    });
    const deleteBucket = vi.fn();

    await expect(
      removeIntegrationBucketIfExists({
        storage,
        bucketExists: vi.fn().mockResolvedValue(true),
        deleteBucket
      })
    ).rejects.toThrow('Failed to clean integration test bucket: failed.txt');
    expect(deleteBucket).not.toHaveBeenCalled();
  });

  it('retries the same bucket on the next setup after bucket deletion fails', async () => {
    const storage = createVitestStorageMock({ vi });
    const bucketExists = vi.fn().mockResolvedValue(true);
    const deleteBucket = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary delete failure'))
      .mockResolvedValueOnce(undefined);

    await expect(
      removeIntegrationBucketIfExists({ storage, bucketExists, deleteBucket })
    ).rejects.toThrow('temporary delete failure');
    await expect(
      removeIntegrationBucketIfExists({ storage, bucketExists, deleteBucket })
    ).resolves.toBeUndefined();

    expect(bucketExists).toHaveBeenCalledTimes(2);
    expect(deleteBucket).toHaveBeenCalledTimes(2);
  });
});
