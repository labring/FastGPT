import { describe, expect, it, vi } from 'vitest';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import {
  consumeDatasetArchiveTicket,
  createDatasetArchiveTicket,
  DATASET_ARCHIVE_TICKET_TTL_MS
} from '@/service/core/dataset/collection/archiveTicket';

const manifest = {
  directories: ['Knowledge Base/Empty'],
  files: [{ key: 'dataset/dataset-1/file-1', path: 'Knowledge Base/file.txt' }]
};

describe('dataset archive ticket', () => {
  it('stores a compressed short-lived ticket and restores its authorization snapshot', async () => {
    let storedValue = '';
    const redis = {
      set: vi.fn(async ({ value }: { value: string }) => {
        storedValue = value;
      }),
      getAndDelete: vi.fn(async () => storedValue)
    };
    const now = vi.fn(() => 1_000);

    const result = await createDatasetArchiveTicket({
      tmbId: 'member-1',
      teamId: 'team-1',
      datasetId: 'dataset-1',
      manifest,
      redis,
      now
    });

    expect(result.expiresAt).toBe(new Date(1_000 + DATASET_ARCHIVE_TICKET_TTL_MS).toISOString());
    expect(result.ticket).toHaveLength(43);
    expect(redis.set).toHaveBeenCalledWith(
      expect.objectContaining({
        value: expect.stringMatching(/^gzip:v1:/),
        ttlMs: DATASET_ARCHIVE_TICKET_TTL_MS
      })
    );
    expect(storedValue).not.toContain('member-1');
    await expect(
      consumeDatasetArchiveTicket({ tmbId: 'member-1', ticket: result.ticket, redis })
    ).resolves.toEqual({
      tmbId: 'member-1',
      teamId: 'team-1',
      datasetId: 'dataset-1',
      manifest
    });
  });

  it('atomically consumes a legacy JSON ticket and rejects a ticket for another member', async () => {
    const payload = JSON.stringify({
      tmbId: 'member-1',
      teamId: 'team-1',
      datasetId: 'dataset-1',
      manifest
    });
    const redis = { set: vi.fn(), getAndDelete: vi.fn().mockResolvedValue(payload) };

    await expect(
      consumeDatasetArchiveTicket({ tmbId: 'member-1', ticket: 'ticket-1', redis })
    ).resolves.toMatchObject({ tmbId: 'member-1', datasetId: 'dataset-1' });
    await expect(
      consumeDatasetArchiveTicket({ tmbId: 'member-2', ticket: 'ticket-1', redis })
    ).resolves.toBeUndefined();
    expect(redis.getAndDelete).toHaveBeenCalledTimes(2);
  });

  it('returns undefined for expired, malformed, or corrupt compressed ticket values', async () => {
    const redis = {
      set: vi.fn(),
      getAndDelete: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('{')
        .mockResolvedValueOnce('gzip:v1:not-base64')
        .mockResolvedValueOnce(
          JSON.stringify({
            tmbId: 'member-1',
            teamId: 'team-1',
            datasetId: 'dataset-1',
            manifest: {
              directories: [1],
              files: [{ key: 'dataset/dataset-1/file-1', path: 'Knowledge Base/file.txt' }]
            }
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            tmbId: 'member-1',
            teamId: 'team-1',
            datasetId: 'dataset-1',
            manifest: { directories: [], files: [{ key: 1, path: null }] }
          })
        )
    };

    await expect(
      consumeDatasetArchiveTicket({ tmbId: 'member-1', ticket: 'expired', redis })
    ).resolves.toBeUndefined();
    await expect(
      consumeDatasetArchiveTicket({ tmbId: 'member-1', ticket: 'malformed', redis })
    ).resolves.toBeUndefined();
    await expect(
      consumeDatasetArchiveTicket({ tmbId: 'member-1', ticket: 'corrupt', redis })
    ).resolves.toBeUndefined();
    await expect(
      consumeDatasetArchiveTicket({ tmbId: 'member-1', ticket: 'invalid-directory', redis })
    ).resolves.toBeUndefined();
    await expect(
      consumeDatasetArchiveTicket({ tmbId: 'member-1', ticket: 'invalid-file', redis })
    ).resolves.toBeUndefined();
  });

  it('rejects an oversized manifest with the archive limit business error', async () => {
    const redis = { set: vi.fn(), getAndDelete: vi.fn() };

    await expect(
      createDatasetArchiveTicket({
        tmbId: 'member-1',
        teamId: 'team-1',
        datasetId: 'dataset-1',
        manifest: {
          directories: [],
          files: [
            {
              key: 'dataset/dataset-1/file-1',
              path: 'x'.repeat(8 * 1024 * 1024)
            }
          ]
        },
        redis
      })
    ).rejects.toBe(DatasetErrEnum.archiveLimitExceeded);
    expect(redis.set).not.toHaveBeenCalled();
  });
});
