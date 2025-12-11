import { addLog } from '../../../common/system/log';
import { initRerankTrainDataWorker } from './data/worker';
import { initRerankTrainTaskWorker } from './task/worker';

/** Initialize all Rerank training module workers */
export const initRerankTrainWorkers = () => {
  addLog.info('Init Rerank Train Workers...');

  initRerankTrainDataWorker();
  initRerankTrainTaskWorker();
};

// Export all public functions and types
export * from './data/controller';
export * from './data/schema';
export * from './task/controller';
export * from './task/schema';
