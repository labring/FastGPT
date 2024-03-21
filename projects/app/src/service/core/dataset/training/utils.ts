import { generateQA } from '@/service/events/generateQA';
import { generateVector } from '@/service/events/generateVector';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetTrainingSchemaType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';

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
  }
};
