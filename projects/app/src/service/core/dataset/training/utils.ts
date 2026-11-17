import { getSystemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/runtime';
import { generateQA } from '@/service/core/dataset/queues/generateQA';
import { generateRebuildIndex } from '@/service/core/dataset/queues/generateRebuildIndex';
import { generateRebuildSynonym } from '@/service/core/dataset/queues/generateRebuildSynonym';
import { generatePreCreatedData } from '@/service/core/dataset/queues/generatePreCreatedData';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { subscribeTrainingWakeup } from '@fastgpt/service/core/dataset/training/wakeup';
import { datasetParseQueue } from '../queues/datasetParse';
import { logInstanceConfigRead } from '@fastgpt/service/common/system/migrationCoverageLog';

type TrainingQueueDescriptor = {
  run: () => unknown;
  getRemainingSlots: () => number;
};

const trainingQueueByMode: Partial<Record<TrainingModeEnum, TrainingQueueDescriptor>> = {
  [TrainingModeEnum.qa]: {
    run: () => generateQA(),
    getRemainingSlots: () => {
      const max = getSystemInstanceConfig().performance.dataset.qaMaxProcess || 10;
      return Math.max(0, max - (global.qaQueueLen ?? 0));
    }
  },
  [TrainingModeEnum.index]: {
    run: () => generatePreCreatedData(),
    getRemainingSlots: () => {
      const max = getSystemInstanceConfig().performance.dataset.vectorMaxProcess || 10;
      return Math.max(0, max - (global.preCreatedQueueLen ?? 0));
    }
  },
  // 索引/同义词重建按单 worker 串行消费，唤醒时保留各自 1 并发上限。
  [TrainingModeEnum.rebuildIndex]: {
    run: () => generateRebuildIndex(),
    getRemainingSlots: () => Math.max(0, 1 - (global.vectorQueueLen ?? 0))
  },
  [TrainingModeEnum.rebuildSynonym]: {
    run: () => generateRebuildSynonym(),
    getRemainingSlots: () => Math.max(0, 1 - (global.synonymQueueLen ?? 0))
  },
  [TrainingModeEnum.parse]: {
    run: () => datasetParseQueue(),
    getRemainingSlots: () => {
      const max = getSystemInstanceConfig().performance.dataset.parseMaxProcess || 10;
      return Math.max(0, max - (global.datasetParseQueueLen ?? 0));
    }
  }
};

/**
 * 订阅 Redis 训练唤醒信号并按对应队列剩余并发额度补满消费者槽位。
 *
 * 写入方按事务去重后每个 mode 仅广播一次；此处按剩余并发额度拉起循环，
 * 同时保留重建队列（rebuildIndex / rebuildSynonym）自身的单并发限制。
 * 队列本身仍有每分钟的兜底 Cron，因此断线或推送失败会在下一轮 Cron 自动补齐。
 */
export const subscribeDatasetTrainingQueue = () =>
  subscribeTrainingWakeup({
    onModes: (modes) => {
      for (const mode of new Set(modes)) {
        const descriptor = trainingQueueByMode[mode];
        if (!descriptor) {
          continue;
        }
        const remainingSlots = descriptor.getRemainingSlots();
        for (let i = 0; i < remainingSlots; i += 1) {
          descriptor.run();
        }
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
