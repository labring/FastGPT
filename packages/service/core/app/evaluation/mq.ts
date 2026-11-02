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
import { serviceEnv } from '../../../env';
import { getSystemInstanceConfig } from '../../../common/system/systemInstanceConfig/controller';
export type { EvaluationJobData } from '@fastgpt/dal/redis/bullmq';

export const addEvaluationJob = (data: EvaluationJobData) => evaluationMQService.addJob(data);
export const checkEvaluationJobActive = (evalId: string) => evaluationMQService.isJobActive(evalId);
export const getEvaluationWorker = (processor: Processor<EvaluationJobData>) => {
  // 评测并发属于实例配置 performance.task；快照叶子缺省时才回落 env。
  const concurrency =
    getSystemInstanceConfig().performance.task.evalConcurrency ?? serviceEnv.EVAL_CONCURRENCY;

  return evaluationMQService.getWorker(processor, { concurrency });
};
export const removeEvaluationJob = (evalId: string) => evaluationMQService.removeJob(evalId);
