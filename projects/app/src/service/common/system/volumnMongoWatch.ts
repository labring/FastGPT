import { initSystemConfig } from '.';
import { createDatasetTrainingMongoWatch } from '@/service/core/dataset/training/utils';
import { MongoSystemConfigs } from '@fastgpt/service/common/system/config/schema';
import { debounce } from 'lodash';
import { MongoAppTemplate } from '@fastgpt/service/core/app/templates/templateSchema';
import { getAppTemplatesAndLoadThem } from '@fastgpt/service/core/app/templates/register';
import { watchSystemModelUpdate } from '@fastgpt/service/core/ai/config/utils';
import { SystemConfigsTypeEnum } from '@fastgpt/global/common/system/config/constants';

export const startMongoWatch = async () => {
  const cleanupFunctions: (() => void)[] = [];
  
  // 启动所有 Change Stream 监听器并收集清理函数
  cleanupFunctions.push(reloadConfigWatch());
  cleanupFunctions.push(createDatasetTrainingMongoWatch());
  cleanupFunctions.push(refetchAppTemplates());
  cleanupFunctions.push(watchSystemModelUpdate());
  
  console.log('All MongoDB change streams started');
  
  // 返回清理函数，用于关闭所有 Change Stream
  return () => {
    console.log('Closing all MongoDB change streams...');
    cleanupFunctions.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        console.error('Error closing change stream:', error);
      }
    });
    console.log('All MongoDB change streams closed');
  };
};

const reloadConfigWatch = () => {
  let changeStream: any;
  
  const createWatch = () => {
    try {
      changeStream = MongoSystemConfigs.watch();

      changeStream.on('change', async (change) => {
        try {
          if (
            change.operationType === 'update' ||
            (change.operationType === 'insert' &&
              [SystemConfigsTypeEnum.fastgptPro, SystemConfigsTypeEnum.license].includes(
                change.fullDocument.type
              ))
          ) {
            await initSystemConfig();
            console.log('refresh system config');
          }
        } catch (error) {
          console.error('System config change processing error:', error);
        }
      });

      // 添加错误处理和重连机制
      changeStream.on('error', (error) => {
        console.error('System config change stream error:', error);
        setTimeout(() => {
          console.log('Attempting to reconnect system config change stream...');
          createWatch();
        }, 5000);
      });

      changeStream.on('close', () => {
        console.log('System config change stream closed, attempting to reconnect...');
        setTimeout(() => {
          createWatch();
        }, 1000);
      });

      console.log('System config change stream created');
    } catch (error) {
      console.error('Failed to create system config change stream:', error);
      setTimeout(() => {
        createWatch();
      }, 5000);
    }
  };

  createWatch();
  
  return () => {
    if (changeStream) {
      changeStream.close();
    }
  };
};

const refetchAppTemplates = () => {
  let changeStream: any;
  
  const createWatch = () => {
    try {
      changeStream = MongoAppTemplate.watch();

      changeStream.on(
        'change',
        debounce(async (change) => {
          setTimeout(() => {
            try {
              getAppTemplatesAndLoadThem(true);
            } catch (error) {
              console.error('App templates reload error:', error);
            }
          }, 5000);
        }, 500)
      );

      // 添加错误处理和重连机制
      changeStream.on('error', (error) => {
        console.error('App templates change stream error:', error);
        setTimeout(() => {
          console.log('Attempting to reconnect app templates change stream...');
          createWatch();
        }, 5000);
      });

      changeStream.on('close', () => {
        console.log('App templates change stream closed, attempting to reconnect...');
        setTimeout(() => {
          createWatch();
        }, 1000);
      });

      console.log('App templates change stream created');
    } catch (error) {
      console.error('Failed to create app templates change stream:', error);
      setTimeout(() => {
        createWatch();
      }, 5000);
    }
  };

  createWatch();
  
  return () => {
    if (changeStream) {
      changeStream.close();
    }
  };
};
