import { getSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/runtime';
import { generateQA } from '@/service/core/dataset/queues/generateQA';
import { generateRebuildIndex } from '@/service/core/dataset/queues/generateRebuildIndex';
import { generateRebuildSynonym } from '@/service/core/dataset/queues/generateRebuildSynonym';
import { generatePreCreatedData } from '@/service/core/dataset/queues/generatePreCreatedData';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { subscribeTrainingWakeup } from '@fastgpt/service/core/dataset/training/wakeup';
import { datasetParseQueue } from '../queues/datasetParse';
import { logInstanceConfigRead } from '@fastgpt/service/common/system/migrationCoverageLog';

const trainingQueueRunnerByMode: Partial<Record<TrainingModeEnum, () => unknown>> = {
  [TrainingModeEnum.qa]: () => generateQA(),
  [TrainingModeEnum.index]: () => generatePreCreatedData(),
  [TrainingModeEnum.rebuildIndex]: () => generateRebuildIndex(),
  [TrainingModeEnum.rebuildSynonym]: () => generateRebuildSynonym(),
  [TrainingModeEnum.parse]: () => datasetParseQueue()
};

/**
 * 订阅 Redis 训练唤醒信号并拉起对应的开源训练队列。
 *
 * 队列本身有每分钟的兜底 Cron，因此 Redis 推送失败或断线期间漏掉的信号会在下一轮 Cron 自动补齐。
 */
export const subscribeDatasetTrainingQueue = () =>
  subscribeTrainingWakeup({
    onModes: (modes) => {
      for (const mode of modes) {
        trainingQueueRunnerByMode[mode]?.();
      }
    }
  });

export const startTrainingQueue = (fast?: boolean) => {
  const qaMax = getSystemInstanceConfig().performance.dataset.qaMaxProcess || 10;
  const vectorMax = getSystemInstanceConfig().performance.dataset.vectorMaxProcess || 15;
  const parseMax = getSystemInstanceConfig().performance.dataset.parseMaxProcess || 10;
  logInstanceConfigRead({
    callsite: 'runtime.app.dataset.training.startTrainingQueue',
    source: 'bridged-system-env',
    fields: [
      { path: 'performance.dataset.qaMaxProcess', value: qaMax },
      { path: 'performance.dataset.vectorMaxProcess', value: vectorMax },
      { path: 'performance.dataset.parseMaxProcess', value: parseMax }
    ]
  });

  if (!fast) {
    generateQA();
    generateRebuildIndex();
    generateRebuildSynonym();
    generatePreCreatedData();
    datasetParseQueue();
    return;
  }

  // 快速拉起时各队列按自身并发上限分别唤醒消费者，避免某单一队列上限限制其它队列初始消费度。
  for (let i = 0; i < qaMax; i++) {
    generateQA();
  }
  for (let i = 0; i < vectorMax; i++) {
    generatePreCreatedData();
  }
  for (let i = 0; i < parseMax; i++) {
    datasetParseQueue();
  }
  generateRebuildIndex();
  generateRebuildSynonym();
};
