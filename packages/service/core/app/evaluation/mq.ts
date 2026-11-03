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
import { getSystemInstanceConfig } from '../../../common/system/systemInstanceConfig/runtime';
export type { EvaluationJobData } from '@fastgpt/dal/redis/bullmq';

export const addEvaluationJob = (data: EvaluationJobData) => evaluationMQService.addJob(data);
export const checkEvaluationJobActive = (evalId: string) => evaluationMQService.isJobActive(evalId);
export const getEvaluationWorker = (processor: Processor<EvaluationJobData>) => {
  // 评测并发只读实例配置 performance.task。
  const concurrency = getSystemInstanceConfig().performance.task.evalConcurrency;

  return evaluationMQService.getWorker(processor, { concurrency });
};
export const removeEvaluationJob = (evalId: string) => evaluationMQService.removeJob(evalId);
