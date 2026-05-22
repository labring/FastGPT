import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
});
