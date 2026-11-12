import { generateQA } from '@/service/core/dataset/queues/generateQA';
import { generateRebuildIndex } from '@/service/core/dataset/queues/generateRebuildIndex';
import { generateRebuildSynonym } from '@/service/core/dataset/queues/generateRebuildSynonym';
import { generatePreCreatedData } from '@/service/core/dataset/queues/generatePreCreatedData';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { type DatasetTrainingSchemaType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { createResilientChangeStream } from '@fastgpt/service/common/mongo/watch';
import { datasetParseQueue } from '../queues/datasetParse';
import { logInstanceConfigRead } from '@fastgpt/service/common/system/migrationCoverageLog';

type DatasetTrainingChange = {
  operationType?: string;
  /** insert 事件一定带 fullDocument，这里只在该分支读取。 */
  fullDocument?: DatasetTrainingSchemaType;
};

/**
 * 监听训练记录写入并唤醒对应队列。
 *
 * 队列本身有每分钟的兜底 cron，因此断线重连不需要补偿回调：漏掉的事件会被下一轮 cron 补上。
 */
export const createDatasetTrainingMongoWatch = () =>
  createResilientChangeStream<DatasetTrainingChange>({
    name: 'app-dataset-training',
    createStream: () => MongoDatasetTraining.watch(),
    onChange: (change) => {
      if (change.operationType !== 'insert') return;

      const { mode } = change.fullDocument as DatasetTrainingSchemaType;
      if (mode === TrainingModeEnum.qa) {
        generateQA();
      } else if (mode === TrainingModeEnum.index) {
        generatePreCreatedData();
      } else if (mode === TrainingModeEnum.rebuildIndex) {
        generateRebuildIndex();
      } else if (mode === TrainingModeEnum.rebuildSynonym) {
        generateRebuildSynonym();
      } else if (mode === TrainingModeEnum.parse) {
        datasetParseQueue();
      }
    }
  });

export const startTrainingQueue = (fast?: boolean) => {
  const qaMax = global.systemEnv?.qaMaxProcess || 10;
  const vectorMax = global.systemEnv?.vectorMaxProcess || 15;
  const parseMax = global.systemEnv?.datasetParseMaxProcess || 10;
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
