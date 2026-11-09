import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InvalidStorageObjectKeyError } from '@fastgpt-sdk/storage';
import { imageBaseUrl } from '@fastgpt/global/common/file/image/constants';
import { S3Buckets } from '@fastgpt/service/common/s3/config/constants';
import { MongoSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/schema';

vi.unmock('@fastgpt/service/common/s3/queue/delete');

const { executeS3DeleteJob } = await import('@fastgpt/service/common/s3/queue/delete');

describe('executeS3DeleteJob', () => {
  let originalS3BucketMap: typeof global.s3BucketMap;

  beforeEach(() => {
    originalS3BucketMap = global.s3BucketMap;
  });

  afterEach(async () => {
    global.s3BucketMap = originalS3BucketMap;
    await MongoSystemInstanceConfig.deleteMany({ domain: 'site' });
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

  it('skips deleting an avatar that is still referenced by the current site', async () => {
    const avatarKey = 'avatar/team-1/referenced.png';
    await MongoSystemInstanceConfig.create({
      domain: 'site',
      revision: 1,
      overrides: { favicon: `${imageBaseUrl}${avatarKey}` },
      updatedBy: { actor: 'system' }
    });

    const deleteObjectsByMultiKeys = vi.fn().mockResolvedValue({ keys: [] });
    global.s3BucketMap = {
      [S3Buckets.public]: {
        client: {
          deleteObjectsByMultiKeys,
          deleteObjectsByPrefix: vi.fn()
        }
      }
    } as any;

    await executeS3DeleteJob({
      bucketName: S3Buckets.public,
      keys: [avatarKey]
    });

    expect(deleteObjectsByMultiKeys).not.toHaveBeenCalled();
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

  it('does not bypass validation when a single key mixes legacy and non-legacy violations', async () => {
    const deleteObjectsByMultiKeys = vi.fn().mockRejectedValue(
      new InvalidStorageObjectKeyError({
        field: 'keys[0]',
        reason: 'backslash'
      })
    );
    const deleteObjectsByRawKeys = vi.fn();

    global.s3BucketMap = {
      'fastgpt-private': {
        client: { deleteObjectsByMultiKeys, deleteObjectsByRawKeys }
      }
    } as any;

    await expect(
      executeS3DeleteJob({ bucketName: 'fastgpt-private', keys: ['chat\\legacy/../escape.txt'] })
    ).rejects.toMatchObject({
      name: InvalidStorageObjectKeyError.name,
      reason: 'dot_path_segment'
    });
    expect(deleteObjectsByRawKeys).not.toHaveBeenCalled();
  });

  it('does not skip parsed-prefix deletion when a legacy source key also violates non-legacy rules', async () => {
    const key = 'chat\\legacy/../escape.txt';
    const deleteObjectsByMultiKeys = vi.fn().mockResolvedValue({ keys: [] });
    const deleteObjectsByPrefix = vi.fn().mockRejectedValue(
      new InvalidStorageObjectKeyError({
        field: 'prefix',
        reason: 'backslash'
      })
    );

    global.s3BucketMap = {
      'fastgpt-private': {
        client: { deleteObjectsByMultiKeys, deleteObjectsByPrefix }
      }
    } as any;

    await expect(
      executeS3DeleteJob({ bucketName: 'fastgpt-private', keys: [key] })
    ).rejects.toMatchObject({
      name: InvalidStorageObjectKeyError.name,
      reason: 'backslash'
    });
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

  it('does not derive another parsed prefix from a new parsed object key', async () => {
    const key = 'dataset/team/parsed/0123456789abcdef0123456789abcdef/image.png';
    const deleteObjectsByMultiKeys = vi.fn().mockResolvedValue({ keys: [] });
    const deleteObjectsByPrefix = vi.fn().mockResolvedValue({ keys: [] });

    global.s3BucketMap = {
      'fastgpt-private': {
        client: { deleteObjectsByMultiKeys, deleteObjectsByPrefix }
      }
    } as any;

    await executeS3DeleteJob({ bucketName: 'fastgpt-private', keys: [key] });

    expect(deleteObjectsByMultiKeys).toHaveBeenCalledWith({ keys: [key] });
    expect(deleteObjectsByPrefix).not.toHaveBeenCalled();
  });
});
