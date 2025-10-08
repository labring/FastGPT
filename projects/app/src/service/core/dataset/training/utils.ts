import { generateQA } from '@/service/core/dataset/queues/generateQA';
import { generateVector } from '@/service/core/dataset/queues/generateVector';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { type DatasetTrainingSchemaType } from '@fastgpt/global/core/dataset/type';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { datasetParseQueue } from '../queues/datasetParse';

export const createDatasetTrainingMongoWatch = () => {
  let changeStream: any;
  
  const createWatch = () => {
    try {
      changeStream = MongoDatasetTraining.watch();

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
        } catch (error) {
          console.error('Change stream processing error:', error);
        }
      });

      // 添加错误处理和重连机制
      changeStream.on('error', (error) => {
        console.error('Change stream error:', error);
        setTimeout(() => {
          console.log('Attempting to reconnect change stream...');
          createWatch();
        }, 5000); // 5秒后重连
      });

      changeStream.on('close', () => {
        console.log('Change stream closed, attempting to reconnect...');
        setTimeout(() => {
          createWatch();
        }, 1000); // 1秒后重连
      });

      console.log('Dataset training change stream created');
    } catch (error) {
      console.error('Failed to create change stream:', error);
      setTimeout(() => {
        createWatch();
      }, 5000);
    }
  };

  createWatch();
  
  // 返回清理函数
  return () => {
    if (changeStream) {
      changeStream.close();
    }
  };
};

export const startTrainingQueue = (fast?: boolean) => {
  const max = global.systemEnv?.qaMaxProcess || 10;

  for (let i = 0; i < (fast ? max : 1); i++) {
    generateQA();
    generateVector();
    datasetParseQueue();
  }
};
