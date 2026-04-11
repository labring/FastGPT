/** Initialize all Embedding training module workers */
import { addLog } from '../../../common/system/log';
import { initEmbeddingTrainDataWorker } from './data/worker';
import { initEmbeddingTrainTaskWorker } from './task/worker';

// Re-export all public APIs from submodules
export * from './external';
export * from './trainset/controller';
export { MongoEmbeddingTrainset } from './trainset/schema';
export * from './data/controller';
export { MongoEmbeddingTrainsetData } from './data/schema';
export { embeddingTrainDataGenerateQueue } from './data/mq';
export { embeddingTrainDataGenerateProcessor } from './data/processor';
export { initEmbeddingTrainDataWorker } from './data/worker';
export * from './utils';
export { getEmbeddingTrainDataDir } from './constants';
export * from './task/controller';
export { MongoEmbeddingTrainTask } from './task/schema';
export { initEmbeddingTrainTaskWorker } from './task/worker';

export const initEmbeddingTrainWorkers = () => {
  addLog.info('Init Embedding Train Workers...');
  initEmbeddingTrainDataWorker();
  initEmbeddingTrainTaskWorker();
};
