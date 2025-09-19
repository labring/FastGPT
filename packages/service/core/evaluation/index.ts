import { addLog } from '../../common/system/log';
import { initEvalDatasetDataQualityWorker } from './dataset/dataQualityProcessor';
import { initEvalDatasetDataSynthesizeWorker } from './dataset/dataSynthesizeProcessor';
import { initEvalTaskWorker, initEvalTaskItemWorker } from './task/processor';
import { initEvaluationSummaryWorker } from './summary/worker';

// Initialize evaluation workers

export const initEvaluationWorkers = () => {
  addLog.info('Init Evaluation Workers...');

  initEvalTaskWorker();
  initEvalTaskItemWorker();

  initEvalDatasetDataQualityWorker();
  initEvalDatasetDataSynthesizeWorker();

  // 初始化评估总结Worker
  initEvaluationSummaryWorker();
};
