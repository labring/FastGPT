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
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { getRootUser } from '@test/datas/users';

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
