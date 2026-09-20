import { generateQA } from '@/service/core/dataset/queues/generateQA';
import { generateVector } from '@/service/core/dataset/queues/generateVector';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { type DatasetTrainingSchemaType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { createResilientChangeStream } from '@fastgpt/service/common/mongo/watch';
import { datasetParseQueue } from '../queues/datasetParse';

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
      } else if (mode === TrainingModeEnum.chunk) {
        generateVector();
      } else if (mode === TrainingModeEnum.parse) {
        datasetParseQueue();
      }
    }
  });

export const startTrainingQueue = (fast?: boolean) => {
  const max = global.systemEnv?.qaMaxProcess || 10;

  for (let i = 0; i < (fast ? max : 1); i++) {
    generateQA();
    generateVector();
    datasetParseQueue();
  }
};
