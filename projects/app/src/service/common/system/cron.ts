import { initSystemConfig } from '@/pages/api/common/system/getInitData';
import { generateQA } from '@/service/events/generateQA';
import { generateVector } from '@/service/events/generateVector';
import { setCron } from '@fastgpt/service/common/system/cron';

export const setUpdateSystemConfigCron = () => {
  setCron('*/5 * * * *', () => {
    initSystemConfig();
    console.log('refresh system config');
  });
};

export const setTrainingQueueCron = () => {
  setCron('*/3 * * * *', () => {
    generateVector();
    generateQA();
  });
};
