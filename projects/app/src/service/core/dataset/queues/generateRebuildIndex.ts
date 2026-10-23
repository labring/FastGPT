import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { enqueueNextDatasetRebuildTask } from './rebuild';
import { runDatasetRebuildQueue } from './service';
import { isDatasetTrainingWindowOpen } from '../training/schedule';

/** 串行消费索引重建任务；接力只创建 rebuildIndex，不进入导入或增强阶段。 */
export const generateRebuildIndex = (): Promise<void> =>
  runDatasetRebuildQueue({
    mode: TrainingModeEnum.rebuildIndex,
    enqueueNext: enqueueNextDatasetRebuildTask,
    isEnabled: isDatasetTrainingWindowOpen
  });
