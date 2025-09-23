import { generateQA } from '@/service/core/dataset/queues/generateQA';
import { generateVector } from '@/service/core/dataset/queues/generateVector';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { type DatasetTrainingSchemaType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { datasetParseQueue } from '../queues/datasetParse';

export const createDatasetTrainingMongoWatch = () => {
  const changeStream = MongoDatasetTraining.watch();

  changeStream.on('change', async (change) => {
    try {
      if (change.operationType === 'insert') {
        const fullDocument = change.fullDocument as DatasetTrainingSchemaType;
        const { mode } = fullDocument;
        if (mode === TrainingModeEnum.qa) {
          generateQA();
        } else if (mode === TrainingModeEnum.chunk) {
          generateVector();
        } else if (mode === TrainingModeEnum.parse) {
          datasetParseQueue();
        }
      }
    } catch (error) {}
  });
};

export const startTrainingQueue = (fast?: boolean) => {
  const max = global.systemEnv?.qaMaxProcess || 10;

  for (let i = 0; i < (fast ? max : 1); i++) {
    generateQA();
    generateVector();
    datasetParseQueue();
  }
};
