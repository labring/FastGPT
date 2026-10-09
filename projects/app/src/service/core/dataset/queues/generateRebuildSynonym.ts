import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { enqueueNextDatasetSynonymRebuildTask } from './rebuildSynonym';
import { runDatasetRebuildQueue } from './service';
import { isDatasetSynonymEnabled } from '@fastgpt/service/core/dataset/synonym/entity';

/** 串行消费同义词重建任务；功能关闭时不领取任务，接力仍使用同义词入队规则。 */
export const generateRebuildSynonym = (): Promise<void> =>
  runDatasetRebuildQueue({
    mode: TrainingModeEnum.rebuildSynonym,
    enqueueNext: enqueueNextDatasetSynonymRebuildTask,
    isEnabled: isDatasetSynonymEnabled
  });
