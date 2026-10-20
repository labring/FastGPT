import { getModelTestDefaults } from '@test/modelCache';
import { describe, expect, it, vi } from 'vitest';
import * as timerLockUtils from '@fastgpt/service/common/system/timerLock/utils';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import {
  lockTrainingDataByTeamId,
  pushDataListToTrainingQueue
} from '@fastgpt/service/core/dataset/training/controller';
import {
  BLOCKED_LOCK_TIME,
  finalErrorTrainingMatch,
  isFinalErrorTraining
} from '@fastgpt/service/core/dataset/training/query';
import { retryFailedTrainingTasks } from '@fastgpt/service/core/dataset/training/service';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { getRootUser } from '@test/datas/users';

vi.unmock('@fastgpt/service/common/mongo/sessionRun');

describe('dataset training controller', () => {
  it.each([TrainingModeEnum.auto, TrainingModeEnum.imageParse])(
    'does not drop parsed content when %s model metadata is unavailable',
    async (mode) => {
      const root = await getRootUser();
      const q = 'x'.repeat(9000);
      const result = await pushDataListToTrainingQueue({
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: '507f1f77bcf86cd799439011',
        collectionId: '507f1f77bcf86cd799439012',
        vectorModel: getModelTestDefaults().embedding!,
        vlmModelConfigured: true,
        billId: 'test',
        mode,
        data: [{ q }]
      });
      expect(result.insertLen).toBe(1);
      expect(await MongoDatasetTraining.findOne({ mode }).lean()).toMatchObject({ q });
    }
  );
  it('keeps missing VLM checks for callers that do not defer validation', async () => {
    const root = await getRootUser();
    await expect(
      pushDataListToTrainingQueue({
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: '507f1f77bcf86cd799439011',
        collectionId: '507f1f77bcf86cd799439012',
        vectorModel: getModelTestDefaults().embedding!,
        mode: TrainingModeEnum.imageParse,
        billId: 'test',
        data: [{ q: 'source text' }]
      })
    ).rejects.toBe(i18nT('common:error_vlm_not_config'));
  });

  it('should lock retryable team trainings with AI points error message', async () => {
    const root = await getRootUser();
    const otherRoot = await getRootUser();
    const datasetId = '507f1f77bcf86cd799439011';
    const collectionId = '507f1f77bcf86cd799439012';
    const billId = 'test';

    const [retryable, exhausted, otherTeam] = await MongoDatasetTraining.create([
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId,
        collectionId,
        billId,
        mode: TrainingModeEnum.index,
        retryCount: 3
      },
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId,
        collectionId,
        billId,
        mode: TrainingModeEnum.index,
        retryCount: 0
      },
      {
        teamId: otherRoot.teamId,
        tmbId: otherRoot.tmbId,
        datasetId,
        collectionId,
        billId,
        mode: TrainingModeEnum.index,
        retryCount: 3
      }
    ]);

    await lockTrainingDataByTeamId(String(root.teamId));

    const lockedTraining = await MongoDatasetTraining.findById(retryable._id).lean();
    const exhaustedTraining = await MongoDatasetTraining.findById(exhausted._id).lean();
    const otherTeamTraining = await MongoDatasetTraining.findById(otherTeam._id).lean();
    const finalErrorLockedTrainingCount = await MongoDatasetTraining.countDocuments({
      _id: retryable._id,
      ...finalErrorTrainingMatch
    });
    const errorMsg = i18nT('common:code_error.team_error.ai_points_not_enough');

    expect(lockedTraining?.lockTime).toEqual(BLOCKED_LOCK_TIME);
    expect(lockedTraining?.errorMsg).toBe(errorMsg);
    expect(finalErrorLockedTrainingCount).toBe(1);
    if (!lockedTraining) throw new Error('Expected locked training task');
    expect(
      isFinalErrorTraining({
        retryCount: lockedTraining.retryCount,
        lockTime: lockedTraining.lockTime,
        errorMsg: lockedTraining.errorMsg
      })
    ).toBe(true);
    expect(exhaustedTraining?.lockTime).not.toEqual(BLOCKED_LOCK_TIME);
    expect(exhaustedTraining?.errorMsg).toBeUndefined();
    expect(otherTeamTraining?.lockTime).not.toEqual(BLOCKED_LOCK_TIME);
    expect(otherTeamTraining?.errorMsg).toBeUndefined();
  });

  it('should lock the current picked training even when retry count is exhausted', async () => {
    const root = await getRootUser();
    const datasetId = '507f1f77bcf86cd799439021';
    const collectionId = '507f1f77bcf86cd799439022';
    const billId = 'test';

    const [pickedTraining, exhaustedHistory] = await MongoDatasetTraining.create([
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId,
        collectionId,
        billId,
        mode: TrainingModeEnum.index,
        retryCount: 0
      },
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId,
        collectionId,
        billId,
        mode: TrainingModeEnum.index,
        retryCount: 0
      }
    ]);

    await lockTrainingDataByTeamId(String(root.teamId), String(pickedTraining._id));

    const lockedTraining = await MongoDatasetTraining.findById(pickedTraining._id).lean();
    const untouchedTraining = await MongoDatasetTraining.findById(exhaustedHistory._id).lean();
    const errorMsg = i18nT('common:code_error.team_error.ai_points_not_enough');

    expect(lockedTraining?.lockTime).toEqual(BLOCKED_LOCK_TIME);
    expect(lockedTraining?.errorMsg).toBe(errorMsg);
    expect(untouchedTraining?.lockTime).not.toEqual(BLOCKED_LOCK_TIME);
    expect(untouchedTraining?.errorMsg).toBeUndefined();
  });
  it.each(
    [
      {
        mode: TrainingModeEnum.rebuildIndex,
        running: DatasetDataIndexStatusEnum.rebuildIndexRunning,
        failed: DatasetDataIndexStatusEnum.rebuildIndexFailed
      },
      {
        mode: TrainingModeEnum.rebuildSynonym,
        running: DatasetDataIndexStatusEnum.rebuildSynonymRunning,
        failed: DatasetDataIndexStatusEnum.rebuildSynonymFailed
      }
    ].flatMap((value) => [false, true].map((lockHeld) => ({ ...value, lockHeld })))
  )(
    'synchronizes rebuild pause and retry without changing completed data ($mode, lockHeld=$lockHeld)',
    async ({ mode, running, failed, lockHeld }) => {
      const root = await getRootUser();
      const scope = {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId: '507f1f77bcf86cd799439021',
        collectionId: '507f1f77bcf86cd799439022'
      };
      const [data, completed] = await MongoDatasetData.create([
        {
          ...scope,
          q: 'saved content',
          indexes: [],
          indexStatus: running
        },
        {
          ...scope,
          q: 'completed content',
          indexes: [],
          indexStatus: DatasetDataIndexStatusEnum.indexed
        }
      ]);
      const [task, stale] = await MongoDatasetTraining.create([
        {
          ...scope,
          billId: 'test',
          dataId: data._id,
          mode,
          retryCount: 3
        },
        {
          ...scope,
          billId: 'test',
          dataId: completed._id,
          mode,
          retryCount: 3
        }
      ]);
      const lockSpy = lockHeld
        ? vi.spyOn(timerLockUtils, 'checkTimerLock').mockResolvedValueOnce(false)
        : undefined;
      try {
        await lockTrainingDataByTeamId(String(root.teamId), String(task._id));
      } finally {
        lockSpy?.mockRestore();
      }
      const paused = await MongoDatasetData.findById(data._id).lean();
      const pausedTask = await MongoDatasetTraining.findById(task._id).lean();
      expect(paused).toMatchObject({
        indexStatus: failed,
        indexErrorMsg: i18nT('common:code_error.team_error.ai_points_not_enough'),
        q: data.q,
        indexes: data.indexes
      });
      expect(pausedTask).toMatchObject({
        lockTime: BLOCKED_LOCK_TIME,
        retryCount: 3,
        expireAt: null
      });
      expect((await MongoDatasetData.findById(completed._id).lean())?.indexStatus).toBe(
        DatasetDataIndexStatusEnum.indexed
      );
      if (lockHeld)
        expect((await MongoDatasetTraining.findById(stale._id).lean())?.lockTime).not.toEqual(
          BLOCKED_LOCK_TIME
        );
      await retryFailedTrainingTasks({ teamId: String(root.teamId), datasetId: scope.datasetId });
      const retried = await MongoDatasetData.findById(data._id).lean();
      expect(retried?.indexStatus).toBe(running);
      expect(retried?.indexErrorMsg).toBeUndefined();
      expect((await MongoDatasetTraining.findById(task._id).lean())?.lockTime).not.toEqual(
        BLOCKED_LOCK_TIME
      );
    }
  );

  it('rolls back both task and rebuild data when pause synchronization fails', async () => {
    const root = await getRootUser();
    const scope = {
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: '507f1f77bcf86cd799439021',
      collectionId: '507f1f77bcf86cd799439022'
    };
    const data = await MongoDatasetData.create({
      ...scope,
      q: 'saved',
      indexStatus: DatasetDataIndexStatusEnum.rebuildIndexRunning
    });
    const task = await MongoDatasetTraining.create({
      ...scope,
      billId: 'test',
      dataId: data._id,
      mode: TrainingModeEnum.rebuildIndex,
      retryCount: 3
    });
    const spy = vi
      .spyOn(MongoDatasetData, 'bulkWrite')
      .mockRejectedValueOnce(new Error('pause synchronization failed'));
    try {
      await lockTrainingDataByTeamId(String(root.teamId));
    } finally {
      spy.mockRestore();
    }
    expect((await MongoDatasetData.findById(data._id).lean())?.indexStatus).toBe(
      DatasetDataIndexStatusEnum.rebuildIndexRunning
    );
    expect(await MongoDatasetTraining.findById(task._id).lean()).toMatchObject({
      lockTime: task.lockTime,
      expireAt: task.expireAt
    });
    await lockTrainingDataByTeamId(String(root.teamId));
    expect((await MongoDatasetData.findById(data._id).lean())?.indexStatus).toBe(
      DatasetDataIndexStatusEnum.rebuildIndexFailed
    );
  });

  it('pauses multiple batches and does not modify a foreign data reference', async () => {
    const root = await getRootUser();
    const scope = {
      teamId: root.teamId,
      tmbId: root.tmbId,
      datasetId: '507f1f77bcf86cd799439021',
      collectionId: '507f1f77bcf86cd799439022'
    };
    const datas = await MongoDatasetData.insertMany(
      Array.from({ length: 301 }, () => ({
        ...scope,
        q: 'saved',
        indexStatus: DatasetDataIndexStatusEnum.rebuildIndexRunning
      }))
    );
    const foreign = await MongoDatasetData.create({
      ...scope,
      teamId: '507f1f77bcf86cd799439033',
      q: 'foreign',
      indexStatus: DatasetDataIndexStatusEnum.rebuildIndexRunning
    });
    await MongoDatasetTraining.insertMany(
      [...datas, foreign].map((data) => ({
        ...scope,
        billId: 'test',
        dataId: data._id,
        mode: TrainingModeEnum.rebuildIndex,
        retryCount: 3
      }))
    );
    await lockTrainingDataByTeamId(String(root.teamId));
    expect(
      await MongoDatasetTraining.countDocuments({
        teamId: root.teamId,
        lockTime: BLOCKED_LOCK_TIME,
        expireAt: null
      })
    ).toBe(302);
    expect(
      await MongoDatasetData.countDocuments({
        teamId: root.teamId,
        indexStatus: DatasetDataIndexStatusEnum.rebuildIndexFailed
      })
    ).toBe(301);
    expect((await MongoDatasetData.findById(foreign._id).lean())?.indexStatus).toBe(
      DatasetDataIndexStatusEnum.rebuildIndexRunning
    );
  });

  const lockModes = [
    TrainingModeEnum.index,
    TrainingModeEnum.imageParse,
    TrainingModeEnum.image,
    TrainingModeEnum.auto,
    TrainingModeEnum.index
  ];
  it.each(lockModes.flatMap((mode) => [false, true].map((lockHeld) => ({ mode, lockHeld }))))(
    'keeps data indexing and preserves TTL when locking $mode tasks (lockHeld=$lockHeld)',
    async ({ mode, lockHeld }) => {
      const root = await getRootUser();
      const datasetId = '507f1f77bcf86cd799439021';
      const collectionId = '507f1f77bcf86cd799439022';
      const billId = 'test';

      const [data] = await MongoDatasetData.create([
        {
          teamId: root.teamId,
          tmbId: root.tmbId,
          datasetId,
          collectionId,
          q: 'test q',
          a: 'test a',
          indexStatus: DatasetDataIndexStatusEnum.indexing
        }
      ]);

      const [training] = await MongoDatasetTraining.create([
        {
          teamId: root.teamId,
          tmbId: root.tmbId,
          datasetId,
          collectionId,
          dataId: String(data._id),
          billId,
          mode,
          retryCount: 3
        }
      ]);

      // 模拟另一 worker 持有团队锁，验证单条兜底同样只修改 training。
      const lockSpy = lockHeld
        ? vi.spyOn(timerLockUtils, 'checkTimerLock').mockResolvedValueOnce(false)
        : undefined;
      try {
        await lockTrainingDataByTeamId(String(root.teamId), String(training._id));
      } finally {
        lockSpy?.mockRestore();
      }

      const updatedData = await MongoDatasetData.findById(data._id).lean();
      const updatedTraining = await MongoDatasetTraining.findById(training._id).lean();
      const errorMsg = i18nT('common:code_error.team_error.ai_points_not_enough');

      expect(updatedTraining?.lockTime).toEqual(BLOCKED_LOCK_TIME);
      expect(updatedTraining?.errorMsg).toBe(errorMsg);
      expect(updatedTraining?.retryCount).toBe(training.retryCount);
      expect(updatedTraining?.expireAt).toEqual(training.expireAt);
      expect(updatedData?.indexStatus).toBe(DatasetDataIndexStatusEnum.indexing);
      expect(updatedData?.indexErrorMsg).toBeUndefined();
    }
  );
});
