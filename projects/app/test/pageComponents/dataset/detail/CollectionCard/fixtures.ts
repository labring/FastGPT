import { DatasetCollectionDataProcessModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { GetCollectionTrainingDetailResponseType } from '@fastgpt/global/openapi/core/dataset/collection/api';

/** 每次返回独立的计数对象，避免渲染用例和状态工具用例之间共享可变状态。 */
export const createTrainingDetail = (
  overrides: Partial<GetCollectionTrainingDetailResponseType> = {}
): GetCollectionTrainingDetailResponseType => {
  const counts = {
    parse: 0,
    qa: 0,
    chunk: 0,
    rebuildIndex: 0,
    rebuildSynonym: 0,
    index: 0,
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
