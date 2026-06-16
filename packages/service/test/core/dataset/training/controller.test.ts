import { describe, expect, it } from 'vitest';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { lockTrainingDataByTeamId } from '@fastgpt/service/core/dataset/training/controller';
import {
  BLOCKED_LOCK_TIME,
  finalErrorTrainingMatch,
  isFinalErrorTraining
} from '@fastgpt/service/core/dataset/training/query';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { getRootUser } from '@test/datas/users';

describe('dataset training controller', () => {
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
        mode: TrainingModeEnum.chunk,
        retryCount: 3
      },
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId,
        collectionId,
        billId,
        mode: TrainingModeEnum.chunk,
        retryCount: 0
      },
      {
        teamId: otherRoot.teamId,
        tmbId: otherRoot.tmbId,
        datasetId,
        collectionId,
        billId,
        mode: TrainingModeEnum.chunk,
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
    expect(
      isFinalErrorTraining({
        retryCount: lockedTraining?.retryCount,
        lockTime: lockedTraining?.lockTime,
        errorMsg: lockedTraining?.errorMsg
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
        mode: TrainingModeEnum.chunk,
        retryCount: 0
      },
      {
        teamId: root.teamId,
        tmbId: root.tmbId,
        datasetId,
        collectionId,
        billId,
        mode: TrainingModeEnum.chunk,
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
});
