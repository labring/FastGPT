import { beforeEach, describe, expect, it } from 'vitest';
import { DatasetMutationLockOwnerTypeEnum } from '@fastgpt/global/core/dataset/synonym';
import { MongoDatasetMutationLock } from '@fastgpt/service/core/dataset/mutationLock/schema';
import {
  DatasetMutationLockedError,
  acquireDatasetMutationLock,
  acquireDatasetMutationSharedLock,
  assertDatasetMutationLock,
  releaseDatasetMutationLock,
  releaseDatasetMutationSharedLock,
  renewDatasetMutationLock
} from '@fastgpt/service/core/dataset/mutationLock/service';

const teamId = '68ee0bd23d17260b7829b131';
const datasetId = '68ee0bd23d17260b7829b132';

describe('dataset mutation shared/exclusive gate', () => {
  beforeEach(async () => {
    await MongoDatasetMutationLock.deleteMany({ teamId, datasetId });
  });

  it('allows concurrent shared writers and blocks the exclusive synonym owner', async () => {
    await Promise.all([
      acquireDatasetMutationSharedLock({ teamId, datasetId, ownerId: 'writer-1' }),
      acquireDatasetMutationSharedLock({ teamId, datasetId, ownerId: 'writer-2' })
    ]);
    const sharedLock = await MongoDatasetMutationLock.findOne({ teamId, datasetId }).lean();
    expect(sharedLock?.sharedOwners.map((owner) => owner.ownerId).sort()).toEqual([
      'writer-1',
      'writer-2'
    ]);

    await expect(
      acquireDatasetMutationLock({
        teamId,
        datasetId,
        ownerId: 'synonym-1',
        ownerType: DatasetMutationLockOwnerTypeEnum.synonymJob
      })
    ).rejects.toBeInstanceOf(DatasetMutationLockedError);

    await Promise.all([
      releaseDatasetMutationSharedLock({ teamId, datasetId, ownerId: 'writer-1' }),
      releaseDatasetMutationSharedLock({ teamId, datasetId, ownerId: 'writer-2' })
    ]);
    const exclusive = await acquireDatasetMutationLock({
      teamId,
      datasetId,
      ownerId: 'synonym-1',
      ownerType: DatasetMutationLockOwnerTypeEnum.synonymJob
    });
    expect(exclusive.fencingToken).toBeGreaterThan(0);
  });

  it('blocks shared writers while an exclusive lease is active', async () => {
    const exclusive = await acquireDatasetMutationLock({
      teamId,
      datasetId,
      ownerId: 'synonym-1',
      ownerType: DatasetMutationLockOwnerTypeEnum.synonymJob
    });

    await expect(
      acquireDatasetMutationSharedLock({ teamId, datasetId, ownerId: 'writer-1' })
    ).rejects.toBeInstanceOf(DatasetMutationLockedError);

    await releaseDatasetMutationLock({
      teamId,
      datasetId,
      ownerId: 'synonym-1',
      fencingToken: exclusive.fencingToken
    });
    await expect(
      acquireDatasetMutationSharedLock({ teamId, datasetId, ownerId: 'writer-1' })
    ).resolves.toMatchObject({ ownerId: 'writer-1' });
  });

  it('ignores expired shared owners when acquiring an exclusive lease', async () => {
    await MongoDatasetMutationLock.create({
      teamId,
      datasetId,
      fencingToken: 0,
      leaseUntil: new Date(0),
      sharedOwners: [{ ownerId: 'expired-writer', leaseUntil: new Date(0) }]
    });

    await expect(
      acquireDatasetMutationLock({
        teamId,
        datasetId,
        ownerId: 'synonym-1',
        ownerType: DatasetMutationLockOwnerTypeEnum.synonymJob
      })
    ).resolves.toMatchObject({ ownerId: 'synonym-1' });
  });

  it('rejects stale fencing tokens after a new exclusive owner acquires the lock', async () => {
    const first = await acquireDatasetMutationLock({
      teamId,
      datasetId,
      ownerId: 'synonym-1',
      ownerType: DatasetMutationLockOwnerTypeEnum.synonymJob
    });
    await releaseDatasetMutationLock({
      teamId,
      datasetId,
      ownerId: 'synonym-1',
      fencingToken: first.fencingToken
    });
    const second = await acquireDatasetMutationLock({
      teamId,
      datasetId,
      ownerId: 'synonym-2',
      ownerType: DatasetMutationLockOwnerTypeEnum.synonymJob
    });

    expect(second.fencingToken).toBeGreaterThan(first.fencingToken);
    await expect(
      renewDatasetMutationLock({
        teamId,
        datasetId,
        ownerId: 'synonym-1',
        fencingToken: first.fencingToken
      })
    ).rejects.toBeInstanceOf(DatasetMutationLockedError);
    await expect(
      assertDatasetMutationLock({
        teamId,
        datasetId,
        ownerId: 'synonym-1',
        fencingToken: first.fencingToken
      })
    ).rejects.toBeInstanceOf(DatasetMutationLockedError);
  });
});
