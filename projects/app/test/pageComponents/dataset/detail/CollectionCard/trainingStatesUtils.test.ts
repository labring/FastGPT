import { describe, expect, it } from 'vitest';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { createTrainingDetail } from './fixtures';
import {
  getTrainingStepStatus,
  isTrainingStepHighlighted,
  TrainingStatus
} from '@/pageComponents/dataset/detail/CollectionCard/trainingStatesUtils';

describe('getTrainingStepStatus', () => {
  it.each([
    {
      name: 'running first stage',
      queued: 0,
      parsing: 1,
      rebuilding: 0,
      trained: 0,
      parseStatus: TrainingStatus.Running,
      rebuildStatus: TrainingStatus.NotStart
    },
    {
      name: 'queued first stage',
      queued: 1,
      parsing: 0,
      rebuilding: 0,
      trained: 0,
      parseStatus: TrainingStatus.Queued,
      rebuildStatus: TrainingStatus.NotStart
    },
    {
      name: 'later stage started',
      queued: 0,
      parsing: 0,
      rebuilding: 1,
      trained: 1,
      parseStatus: TrainingStatus.Ready,
      rebuildStatus: TrainingStatus.Running
    },
    {
      name: 'simultaneous active stages',
      queued: 0,
      parsing: 1,
      rebuilding: 2,
      trained: 0,
      parseStatus: TrainingStatus.Running,
      rebuildStatus: TrainingStatus.Running
    }
  ])('resolves $name', ({ queued, parsing, rebuilding, trained, parseStatus, rebuildStatus }) => {
    const trainingDetail = createTrainingDetail({ trainedCount: trained });
    trainingDetail.queuedCounts.parse = queued;
    trainingDetail.trainingCounts.parse = parsing;
    trainingDetail.trainingCounts.rebuildIndex = rebuilding;
    const modeOrder = [TrainingModeEnum.parse, TrainingModeEnum.rebuildIndex];
    expect(getTrainingStepStatus({ trainingDetail, mode: TrainingModeEnum.parse, modeOrder })).toBe(
      parseStatus
    );
    expect(
      getTrainingStepStatus({ trainingDetail, mode: TrainingModeEnum.rebuildIndex, modeOrder })
    ).toBe(rebuildStatus);
  });

  it('does not let another flow block completion of this flow', () => {
    const trainingDetail = createTrainingDetail();
    trainingDetail.trainingCounts.rebuildSynonym = 3;
    expect(
      getTrainingStepStatus({
        trainingDetail,
        mode: TrainingModeEnum.rebuildIndex,
        modeOrder: [TrainingModeEnum.rebuildIndex]
      })
    ).toBe(TrainingStatus.Ready);
  });
});

describe('isTrainingStepHighlighted', () => {
  it.each([
    [TrainingStatus.Ready, true],
    [TrainingStatus.Queued, true],
    [TrainingStatus.Running, true],
    [TrainingStatus.Error, true],
    [TrainingStatus.NotStart, false]
  ])('highlights %s=%s', (status, expected) => {
    expect(isTrainingStepHighlighted(status)).toBe(expected);
  });
});
