import { getWorker, QueueNames } from '../../../common/bullmq';
import { addLog } from '../../../common/system/log';
import { MongoEvaluation } from '../task/schema';
import { SummaryStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import type { EvaluationSchemaType } from '@fastgpt/global/core/evaluation/type';
import { type EvaluationSummaryJobData, getEvaluationSummaryQueue } from './queue';
import { EvaluationSummaryService } from './index';
import { SummaryStatusHandler } from './statusHandler';

// 准备单个评估器任务
async function prepareSingleEvaluatorTask(
  evaluation: EvaluationSchemaType,
  metricId: string
): Promise<{
  metricId: string;
  evaluatorIndex: number;
  evaluator: any;
} | null> {
  const evaluatorIndex = evaluation.evaluators.findIndex(
    (evaluator: any) => evaluator.metric._id.toString() === metricId
  );

  if (evaluatorIndex === -1) {
    addLog.warn('[EvaluationSummary] Metric does not belong to this evaluation task', {
      evalId: evaluation._id.toString(),
      metricId
    });
    return null;
  }

  // Get metric name for logging
  const metricName = evaluation.evaluators[evaluatorIndex].metric.name;

  return {
    metricId,
    evaluatorIndex,
    evaluator: evaluation.evaluators[evaluatorIndex]
  };
}

// 初始化评估总结Worker
export function initEvaluationSummaryWorker() {
  const worker = getWorker<EvaluationSummaryJobData>(
    QueueNames.evaluationSummary,
    async (job) => {
      const { evalId, metricId } = job.data;

      addLog.info('[EvaluationSummary] Worker processing single metric task', {
        jobId: job.id,
        evalId,
        metricId
      });

      try {
        // 获取评估任务数据
        const evaluation = await MongoEvaluation.findById(evalId).lean();
        if (!evaluation) {
          throw new Error(`Evaluation task not found: ${evalId}`);
        }

        // 验证和准备单个评估器任务
        const evaluatorTask = await prepareSingleEvaluatorTask(evaluation, metricId);

        if (!evaluatorTask) {
          addLog.warn('[EvaluationSummary] No valid metric to process', {
            evalId,
            metricId
          });
          return;
        }

        // 状态更新将通过BullMQ事件监听器自动处理

        // 执行单个指标的评估总结生成
        await EvaluationSummaryService.generateSingleMetricSummary(
          evaluation,
          evaluatorTask.metricId,
          evaluatorTask.evaluatorIndex,
          evaluatorTask.evaluator
        );

        addLog.info('[EvaluationSummary] Worker task completed successfully', {
          jobId: job.id,
          evalId,
          metricId
        });
      } catch (error) {
        // 状态更新将通过BullMQ的failed事件监听器自动处理
        addLog.error('[EvaluationSummary] Worker task failed', {
          jobId: job.id,
          evalId,
          metricId,
          error
        });
        throw error;
      }
    },
    {
      stalledInterval: 30000, // 30 seconds
      maxStalledCount: 3 // BullMQ recommended
    }
  );

  // 监听任务开始事件
  worker.on('active', async (job) => {
    if (job?.data) {
      const { evalId, metricId } = job.data;

      addLog.info('[EvaluationSummary] Task started', {
        jobId: job.id,
        evalId,
        metricId,
        timestamp: new Date().toISOString()
      });

      // 更新状态为generating
      await SummaryStatusHandler.updateStatus(
        evalId,
        metricId,
        SummaryStatusEnum.generating,
        undefined,
        new Date()
      );
    }
  });

  // 监听任务完成事件
  worker.on('completed', async (job) => {
    if (job?.data) {
      const { evalId, metricId } = job.data;

      addLog.info('[EvaluationSummary] Task completed', {
        jobId: job.id,
        evalId,
        metricId,
        timestamp: new Date().toISOString()
      });

      // 更新状态为completed
      await SummaryStatusHandler.updateStatus(
        evalId,
        metricId,
        SummaryStatusEnum.completed,
        undefined,
        new Date()
      );
    }
  });

  // 监听任务停滞事件
  worker.on('stalled', async (jobId: string) => {
    try {
      const summaryQueue = getEvaluationSummaryQueue();
      const job = await summaryQueue.getJob(jobId);

      if (job?.data) {
        const { evalId, metricId } = job.data;

        addLog.warn('[EvaluationSummary] Task job stalled, will be retried', {
          jobId,
          evalId,
          metricId,
          timestamp: new Date().toISOString()
        });

        // 将状态重置为pending，等待重试
        await SummaryStatusHandler.updateStatus(
          evalId,
          metricId,
          SummaryStatusEnum.pending,
          undefined,
          new Date()
        );
      } else {
        addLog.warn(
          '[EvaluationSummary] Task job stalled, will be retried (could not get job data)',
          {
            jobId,
            timestamp: new Date().toISOString()
          }
        );
      }
    } catch (error) {
      addLog.warn(
        '[EvaluationSummary] Task job stalled, will be retried (could not get job data)',
        {
          jobId,
          error,
          timestamp: new Date().toISOString()
        }
      );
    }
  });

  // 监听任务失败事件
  worker.on('failed', async (job, error) => {
    if (job?.data) {
      const { evalId, metricId } = job.data;

      addLog.warn('[EvaluationSummary] Task failed', {
        jobId: job.id,
        evalId,
        metricId,
        error: error.message,
        timestamp: new Date().toISOString()
      });

      // 更新状态为failed
      await SummaryStatusHandler.updateStatus(
        evalId,
        metricId,
        SummaryStatusEnum.failed,
        error.message,
        new Date()
      );
    }
  });

  addLog.info('[EvaluationSummary] Worker created successfully');
  return worker;
}
