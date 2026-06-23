import { describe, expect, it } from 'vitest';
import {
  DatasetCollectionDataProcessModeEnum,
  TrainingModeEnum
} from '@fastgpt/global/core/dataset/constants';
import type { GetCollectionTrainingDetailResponseType } from '@fastgpt/global/openapi/core/dataset/collection/api';
import {
  getTrainingStepStatus,
  isTrainingStepHighlighted,
  TrainingStatus
} from '@/pageComponents/dataset/detail/CollectionCard/trainingStatesUtils';

const createTrainingDetail = (
  overrides: Partial<GetCollectionTrainingDetailResponseType> = {}
): GetCollectionTrainingDetailResponseType => {
  const counts = {
    parse: 0,
    qa: 0,
    chunk: 0,
    image: 0,
    auto: 0,
    imageParse: 0
  };

  return {
    trainingType: DatasetCollectionDataProcessModeEnum.chunk,
    advancedTraining: {
      customPdfParse: false,
      imageIndex: false,
      autoIndexes: false
    },
    queuedCounts: { ...counts },
    trainingCounts: { ...counts },
    errorCounts: { ...counts },
    trainedCount: 0,
    ...overrides
  };
};

describe('trainingStatesUtils', () => {
  it('should mark parsing step as running while content parsing is active', () => {
    const trainingDetail = createTrainingDetail({
      trainingCounts: {
        parse: 1,
        qa: 0,
        chunk: 0,
        image: 0,
        auto: 0,
        imageParse: 0
      }
    });
    const modeOrder = [TrainingModeEnum.parse, TrainingModeEnum.chunk];

    expect(
      getTrainingStepStatus({
        trainingDetail,
        mode: TrainingModeEnum.parse,
        modeOrder
      })
    ).toBe(TrainingStatus.Running);
    expect(
      getTrainingStepStatus({
        trainingDetail,
        mode: TrainingModeEnum.chunk,
        modeOrder
      })
    ).toBe(TrainingStatus.NotStart);
  });

  it('should mark parsing step as queued while waiting to be picked by worker', () => {
    const trainingDetail = createTrainingDetail({
      queuedCounts: {
        parse: 1,
        qa: 0,
        chunk: 0,
        image: 0,
        auto: 0,
        imageParse: 0
      }
    });
    const modeOrder = [TrainingModeEnum.parse, TrainingModeEnum.chunk];

    expect(
      getTrainingStepStatus({
        trainingDetail,
        mode: TrainingModeEnum.parse,
        modeOrder
      })
    ).toBe(TrainingStatus.Queued);
    expect(
      getTrainingStepStatus({
        trainingDetail,
        mode: TrainingModeEnum.chunk,
        modeOrder
      })
    ).toBe(TrainingStatus.NotStart);
  });

  it('should mark earlier steps ready after later steps start', () => {
    const trainingDetail = createTrainingDetail({
      trainingCounts: {
        parse: 0,
        qa: 0,
        chunk: 1,
        image: 0,
        auto: 0,
        imageParse: 0
      },
      trainedCount: 1
    });
    const modeOrder = [TrainingModeEnum.parse, TrainingModeEnum.chunk];

    expect(
      getTrainingStepStatus({
        trainingDetail,
        mode: TrainingModeEnum.parse,
        modeOrder
      })
    ).toBe(TrainingStatus.Ready);
    expect(
      getTrainingStepStatus({
        trainingDetail,
        mode: TrainingModeEnum.chunk,
        modeOrder
      })
    ).toBe(TrainingStatus.Running);
  });

  it('should keep multiple in-progress stages highlighted at the same time', () => {
    const trainingDetail = createTrainingDetail({
      trainingCounts: {
        parse: 1,
        qa: 0,
        chunk: 2,
        image: 0,
        auto: 0,
        imageParse: 0
      }
    });
    const modeOrder = [TrainingModeEnum.parse, TrainingModeEnum.chunk];

    const parseStatus = getTrainingStepStatus({
      trainingDetail,
      mode: TrainingModeEnum.parse,
      modeOrder
    });
    const chunkStatus = getTrainingStepStatus({
      trainingDetail,
      mode: TrainingModeEnum.chunk,
      modeOrder
    });

    expect(parseStatus).toBe(TrainingStatus.Running);
    expect(chunkStatus).toBe(TrainingStatus.Running);
    expect(isTrainingStepHighlighted(parseStatus)).toBe(true);
    expect(isTrainingStepHighlighted(chunkStatus)).toBe(true);
  });

  it('should highlight completed steps and gray out only not-started steps', () => {
    expect(isTrainingStepHighlighted(TrainingStatus.Ready)).toBe(true);
    expect(isTrainingStepHighlighted(TrainingStatus.Queued)).toBe(true);
    expect(isTrainingStepHighlighted(TrainingStatus.Running)).toBe(true);
    expect(isTrainingStepHighlighted(TrainingStatus.Error)).toBe(true);
    expect(isTrainingStepHighlighted(TrainingStatus.NotStart)).toBe(false);
  });
});
