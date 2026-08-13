import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvalidStorageObjectKeyError } from '@fastgpt-sdk/storage';

vi.unmock('@fastgpt/service/common/s3/queue/delete');

const { executeS3DeleteJob } = await import('@fastgpt/service/common/s3/queue/delete');

describe('executeS3DeleteJob', () => {
  let originalS3BucketMap: typeof global.s3BucketMap;

  beforeEach(() => {
    originalS3BucketMap = global.s3BucketMap;
  });

  afterEach(() => {
    global.s3BucketMap = originalS3BucketMap;
    vi.clearAllMocks();
  });

  it('waits for prefix deletion before completing the queue job', async () => {
    let prefixDeleted = false;
    const deleteObjectsByPrefix = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      prefixDeleted = true;
      return { keys: [] };
    });

    global.s3BucketMap = {
      'fastgpt-private': {
        client: {
          deleteObjectsByPrefix
        }
      }
    } as any;

    await executeS3DeleteJob({
      bucketName: 'fastgpt-private',
      prefix: 'agent-skills/team-1/skill-1/'
    });

    expect(prefixDeleted).toBe(true);
    expect(deleteObjectsByPrefix).toHaveBeenCalledWith({
      prefix: 'agent-skills/team-1/skill-1/'
    });
  });

  it('throws when prefix deletion reports failed keys so BullMQ can retry', async () => {
    global.s3BucketMap = {
      'fastgpt-private': {
        client: {
          deleteObjectsByPrefix: vi.fn(async () => ({ keys: ['agent-skills/team/skill/v1.zip'] }))
        }
      }
    } as any;

    await expect(
      executeS3DeleteJob({
        bucketName: 'fastgpt-private',
        prefix: 'agent-skills/team/skill/'
      })
    ).rejects.toThrow('Failed to delete 1 S3 object');
  });

  it('throws when multi-key deletion reports failed keys so BullMQ can retry', async () => {
    global.s3BucketMap = {
      'fastgpt-private': {
        client: {
          deleteObjectsByMultiKeys: vi.fn(async () => ({ keys: ['dataset/team/failed.txt'] }))
        }
      }
    } as any;

    await expect(
      executeS3DeleteJob({
        bucketName: 'fastgpt-private',
        keys: ['dataset/team/deleted.txt', 'dataset/team/failed.txt']
      })
    ).rejects.toThrow('Failed to delete 1 S3 object');
  });

  it('falls back to raw key deletion for legacy keys rejected by validation', async () => {
    const legacyKey = 'chat/app/legacy\r\nname.svg';
    const deleteObjectsByMultiKeys = vi.fn().mockRejectedValue(
      new InvalidStorageObjectKeyError({
        field: 'keys[0]',
        reason: 'control_character'
      })
    );
    const deleteObjectsByRawKeys = vi.fn().mockResolvedValue({ keys: [] });
    const deleteObjectsByPrefix = vi.fn().mockRejectedValue(
      new InvalidStorageObjectKeyError({
        field: 'prefix',
        reason: 'control_character'
      })
    );

    global.s3BucketMap = {
      'fastgpt-private': {
        client: { deleteObjectsByMultiKeys, deleteObjectsByRawKeys, deleteObjectsByPrefix }
      }
    } as any;

    await expect(
      executeS3DeleteJob({ bucketName: 'fastgpt-private', keys: [legacyKey] })
    ).resolves.toBeUndefined();

    expect(deleteObjectsByRawKeys).toHaveBeenCalledWith({ keys: [legacyKey] });
    expect(deleteObjectsByPrefix).toHaveBeenCalled();
  });

  it('does not bypass validation for non-legacy key errors', async () => {
    const deleteObjectsByMultiKeys = vi.fn().mockRejectedValue(
      new InvalidStorageObjectKeyError({
        field: 'keys[0]',
        reason: 'dot_path_segment'
      })
    );
    const deleteObjectsByRawKeys = vi.fn();

    global.s3BucketMap = {
      'fastgpt-private': {
        client: { deleteObjectsByMultiKeys, deleteObjectsByRawKeys }
      }
    } as any;

    await expect(
      executeS3DeleteJob({ bucketName: 'fastgpt-private', keys: ['../escape.txt'] })
    ).rejects.toBeInstanceOf(InvalidStorageObjectKeyError);
    expect(deleteObjectsByRawKeys).not.toHaveBeenCalled();
  });

  it('rejects a mixed batch instead of bypassing non-legacy validation', async () => {
    const legacyKey = 'chat/app/legacy\r\nname.svg';
    const deleteObjectsByMultiKeys = vi.fn().mockRejectedValue(
      new InvalidStorageObjectKeyError({
        field: 'keys[0]',
        reason: 'control_character'
      })
    );
    const deleteObjectsByRawKeys = vi.fn();

    global.s3BucketMap = {
      'fastgpt-private': {
        client: { deleteObjectsByMultiKeys, deleteObjectsByRawKeys }
      }
    } as any;

    await expect(
      executeS3DeleteJob({
        bucketName: 'fastgpt-private',
        keys: [legacyKey, '../escape.txt']
      })
    ).rejects.toMatchObject({
      name: InvalidStorageObjectKeyError.name,
      reason: 'dot_path_segment'
    });
    expect(deleteObjectsByRawKeys).not.toHaveBeenCalled();
  });

  it('does not silently skip parsed-prefix deletion for a valid key', async () => {
    const longValidKey = `dataset/team/${'a'.repeat(782)}.txt`;
    const deleteObjectsByMultiKeys = vi.fn().mockResolvedValue({ keys: [] });
    const deleteObjectsByPrefix = vi.fn().mockRejectedValue(
      new InvalidStorageObjectKeyError({
        field: 'prefix',
        reason: 'too_long'
      })
    );

    global.s3BucketMap = {
      'fastgpt-private': {
        client: { deleteObjectsByMultiKeys, deleteObjectsByPrefix }
      }
    } as any;

    await expect(
      executeS3DeleteJob({ bucketName: 'fastgpt-private', keys: [longValidKey] })
    ).rejects.toBeInstanceOf(InvalidStorageObjectKeyError);
    expect(deleteObjectsByPrefix).toHaveBeenCalled();
  });
});
