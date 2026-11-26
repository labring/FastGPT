/**
 * 评测领域对 DAL 队列合同的薄入口。
 *
 * 队列合同和状态操作集中在 DAL `redis/bullmq/services/evaluation`；评测并发属于
 * service 环境配置，因此在领域入口显式传入。
 */
import {
  evaluationMQService,
  type EvaluationJobData,
  type Processor
} from '@fastgpt/dal/redis/bullmq';
import {
  getSystemInstanceConfig,
  onSystemInstanceConfigSnapshot
} from '../../../common/system/systemInstanceConfig/runtime';
export type { EvaluationJobData } from '@fastgpt/dal/redis/bullmq';

export const addEvaluationJob = (data: EvaluationJobData) => evaluationMQService.addJob(data);
export const checkEvaluationJobActive = (evalId: string) => evaluationMQService.isJobActive(evalId);
let currentProcessor: Processor<EvaluationJobData> | undefined;
let unsubscribeSnapshot: (() => void) | undefined;

/** 快照重载后把新并发同步到已存在的 Worker；DAL 命中缓存时会原地更新 concurrency。 */
const syncWorkerConcurrency = () => {
  if (!currentProcessor) return;
  try {
    evaluationMQService.getWorker(currentProcessor, {
      concurrency: getSystemInstanceConfig().performance.task.evalConcurrency
    });
  } catch {
    // Worker 处于断线重启窗口时新并发已写入 workerOpts，重建后自动生效
  }
};

export const getEvaluationWorker = (processor: Processor<EvaluationJobData>) => {
  // 评测并发只读实例配置 performance.task。
  const concurrency = getSystemInstanceConfig().performance.task.evalConcurrency;
  currentProcessor = processor;
  // Worker 是进程级缓存，订阅一次即可，重载后只需把新并发重新传进去
  unsubscribeSnapshot ??= onSystemInstanceConfigSnapshot(syncWorkerConcurrency);

  return evaluationMQService.getWorker(processor, { concurrency });
};
export const removeEvaluationJob = (evalId: string) => evaluationMQService.removeJob(evalId);
