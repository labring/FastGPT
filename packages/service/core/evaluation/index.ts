import { addLog } from '../../common/system/log';
import { initEvalDatasetDataQualityWorker } from './dataset/dataQualityProcessor';
import { initEvalDatasetDataSynthesizeWorker } from './dataset/dataSynthesizeProcessor';
import { initEvalDatasetSmartGenerateWorker } from './dataset/smartGenerateProcessor';
import { initEvalTaskWorker, initEvalTaskItemWorker } from './task/processor';

// Initialize evaluation workers

export const initEvaluationWorkers = () => {
  addLog.info('Init Evaluation Workers...');

  initEvalTaskWorker();
  initEvalTaskItemWorker();

  initEvalDatasetDataQualityWorker();
  initEvalDatasetSmartGenerateWorker();
  initEvalDatasetDataSynthesizeWorker();
};
