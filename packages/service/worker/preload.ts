import { getWorkerController, WorkerNameEnum } from './utils';
import { getLogger, LogCategories } from '../common/logger';
import { getTokenWorkerCount } from './tokenWorkerConfig';

const logger = getLogger(LogCategories.SYSTEM);

/**
 * 服务启动时预热 token worker 池，避免首次聊天请求在业务路径上承担 tokenizer 初始化成本。
 *
 * 当前 worker 数量已经被限制为 min(cpu, 4)，一次性并发创建的资源峰值可控；
 * 因此不再分批预热，减少启动阶段的额外等待和中间日志噪音。
 */
export const preLoadWorker = async () => {
  const start = Date.now();
  const max = getTokenWorkerCount();
  const workerController = getWorkerController({
    name: WorkerNameEnum.countGptMessagesTokens,
    maxReservedThreads: max
  });

  await Promise.all(
    Array.from({ length: max }, async () => {
      const worker = workerController.createWorker();
      // 用最小消息触发 worker 内 tokenizer 的首次加载，后续请求可复用已初始化 worker。
      await workerController.run({
        workerId: worker.id,
        messages: [
          {
            role: 'user',
            content: '1'
          }
        ]
      });
    })
  );

  logger.info('Worker preload completed', {
    queuedWorkers: workerController.workerQueue.length,
    durationMs: Date.now() - start,
    max
  });
};
