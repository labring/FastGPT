import { describe, expect, it } from 'vitest';
import {
  CollectionTrainingStatusEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import {
  compareTrainingModeBySlowest,
  getSlowestTrainingStatus,
  getCollectionTrainingStatusByMode,
  getTrainingModeRank
} from '@fastgpt/service/core/dataset/training/query';

describe('dataset training query helpers', () => {
  it('orders modes by the earliest remaining stage as slowest', () => {
    expect(getTrainingModeRank(TrainingModeEnum.parse)).toBeLessThan(
      getTrainingModeRank(TrainingModeEnum.imageParse)
    );
    expect(getTrainingModeRank(TrainingModeEnum.imageParse)).toBeLessThan(
      getTrainingModeRank(TrainingModeEnum.qa)
    );
    expect(
      compareTrainingModeBySlowest(TrainingModeEnum.image, TrainingModeEnum.rebuildIndex)
    ).toBeLessThan(0);
  });

  it('returns running when the slowest stage still has active records', () => {
    const status = getSlowestTrainingStatus({
      [TrainingModeEnum.parse]: { activeCount: 1, finalErrorCount: 0 },
      [TrainingModeEnum.rebuildIndex]: { activeCount: 0, finalErrorCount: 2 }
    });

    expect(status).toEqual({
      slowestTrainingMode: TrainingModeEnum.parse,
      slowestTrainingStatus: CollectionTrainingStatusEnum.running
    });
  });

  it('returns error only when the slowest stage has final errors and no active records', () => {
    const status = getSlowestTrainingStatus({
      [TrainingModeEnum.image]: { activeCount: 0, finalErrorCount: 1 },
      [TrainingModeEnum.rebuildIndex]: { activeCount: 3, finalErrorCount: 0 }
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

describe('getCollectionTrainingStatusByMode', () => {
  it('returns ready only when training and rebuild data are empty', () => {
    expect(getCollectionTrainingStatusByMode({ modeCounts: {} })).toEqual({
      trainingAmount: 0,
      activeTrainingAmount: 0,
      finalErrorAmount: 0,
      hasError: false,
      slowestTrainingStatus: CollectionTrainingStatusEnum.ready
    });
    expect(
      getCollectionTrainingStatusByMode({
        modeCounts: {},
        rebuildIndexCounts: { activeCount: 3, finalErrorCount: 0 }
      })
    ).toMatchObject({
      trainingAmount: 3,
      activeTrainingAmount: 3,
      finalErrorAmount: 0,
      hasError: false,
      slowestTrainingMode: TrainingModeEnum.rebuildIndex,
      slowestTrainingStatus: CollectionTrainingStatusEnum.running
    });
  });
  it('uses data rebuild counts instead of training counts without mutating input', () => {
    const modeCounts = {
      [TrainingModeEnum.qa]: { activeCount: 0, finalErrorCount: 1 },
      [TrainingModeEnum.rebuildIndex]: { activeCount: 2, finalErrorCount: 2 }
    };
    expect(
      getCollectionTrainingStatusByMode({
        modeCounts,
        rebuildIndexCounts: { activeCount: 3, finalErrorCount: 0 }
      })
    ).toMatchObject({
      trainingAmount: 4,
      activeTrainingAmount: 3,
      finalErrorAmount: 1,
      hasError: true,
      slowestTrainingMode: TrainingModeEnum.qa,
      slowestTrainingStatus: CollectionTrainingStatusEnum.error
    });
    expect(modeCounts.rebuildIndex.activeCount).toBe(2);
  });
});
