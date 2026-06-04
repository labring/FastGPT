import { describe, expect, it } from 'vitest';
import {
  CollectionTrainingStatusEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import {
  BLOCKED_LOCK_TIME,
  compareTrainingModeBySlowest,
  getSlowestTrainingStatus,
  getTrainingModeRank,
  hasEffectiveErrorMsg,
  isActiveTraining,
  isFinalErrorTraining,
  isRemainingTraining,
  isTemporarilyFailedTraining
} from '@fastgpt/service/core/dataset/training/query';

describe('dataset training query helpers', () => {
  it('treats empty or whitespace errorMsg as ineffective', () => {
    expect(hasEffectiveErrorMsg({ errorMsg: undefined })).toBe(false);
    expect(hasEffectiveErrorMsg({ errorMsg: '' })).toBe(false);
    expect(hasEffectiveErrorMsg({ errorMsg: '   \n\t' })).toBe(false);
    expect(hasEffectiveErrorMsg({ errorMsg: 'failed' })).toBe(true);
  });

  it('separates active, temporary failed and final error records', () => {
    const active = {
      retryCount: 1,
      lockTime: new Date('2049-12-31'),
      errorMsg: ''
    };
    const temporaryFailed = {
      retryCount: 1,
      lockTime: new Date('2049-12-31'),
      errorMsg: ' failed '
    };
    const retryExhausted = {
      retryCount: 0,
      lockTime: new Date('2049-12-31'),
      errorMsg: 'failed'
    };
    const permanentlyLocked = {
      retryCount: 3,
      lockTime: BLOCKED_LOCK_TIME,
      errorMsg: 'failed'
    };

    expect(isActiveTraining(active)).toBe(true);
    expect(isRemainingTraining(active)).toBe(true);

    expect(isActiveTraining(temporaryFailed)).toBe(true);
    expect(isTemporarilyFailedTraining(temporaryFailed)).toBe(true);
    expect(isFinalErrorTraining(temporaryFailed)).toBe(false);

    expect(isActiveTraining(retryExhausted)).toBe(false);
    expect(isFinalErrorTraining(retryExhausted)).toBe(true);
    expect(isRemainingTraining(retryExhausted)).toBe(true);

    expect(isActiveTraining(permanentlyLocked)).toBe(false);
    expect(isFinalErrorTraining(permanentlyLocked)).toBe(true);
  });

  it('orders modes by the earliest remaining stage as slowest', () => {
    expect(getTrainingModeRank(TrainingModeEnum.parse)).toBeLessThan(
      getTrainingModeRank(TrainingModeEnum.imageParse)
    );
    expect(getTrainingModeRank(TrainingModeEnum.imageParse)).toBeLessThan(
      getTrainingModeRank(TrainingModeEnum.qa)
    );
    expect(
      compareTrainingModeBySlowest(TrainingModeEnum.image, TrainingModeEnum.chunk)
    ).toBeLessThan(0);
  });

  it('returns running when the slowest stage still has active records', () => {
    const status = getSlowestTrainingStatus({
      [TrainingModeEnum.parse]: { activeCount: 1, finalErrorCount: 0 },
      [TrainingModeEnum.chunk]: { activeCount: 0, finalErrorCount: 2 }
    });

    expect(status).toEqual({
      slowestTrainingMode: TrainingModeEnum.parse,
      slowestTrainingStatus: CollectionTrainingStatusEnum.running
    });
  });

  it('returns error only when the slowest stage has final errors and no active records', () => {
    const status = getSlowestTrainingStatus({
      [TrainingModeEnum.image]: { activeCount: 0, finalErrorCount: 1 },
      [TrainingModeEnum.chunk]: { activeCount: 3, finalErrorCount: 0 }
    });

    expect(status).toEqual({
      slowestTrainingMode: TrainingModeEnum.image,
      slowestTrainingStatus: CollectionTrainingStatusEnum.error
    });
  });

  it('returns ready when there are no remaining records', () => {
    expect(getSlowestTrainingStatus({})).toEqual({
      slowestTrainingStatus: CollectionTrainingStatusEnum.ready
    });
  });
});
