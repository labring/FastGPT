import { getWorker, QueueNames } from '../../../common/bullmq';
import { addLog } from '../../../common/system/log';
import { MongoEvaluation } from '../task/schema';
import { SummaryStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { type EvaluationSummaryJobData, getEvaluationSummaryQueue } from './queue';
import { EvaluationSummaryService } from './index';
import { SummaryStatusHandler } from './statusHandler';

export function initEvaluationSummaryWorker() {
  const worker = getWorker<EvaluationSummaryJobData>(
    QueueNames.evaluationSummary,
    async (job) => {
      const { evalId, metricId, languageType } = job.data;

      addLog.info('[EvaluationSummary] Worker processing single metric task', {
        jobId: job.id,
        evalId,
        metricId,
        languageType
      });

      try {
        const evaluation = await MongoEvaluation.findById(evalId).lean();
        if (!evaluation) {
          throw new Error(`Evaluation task not found: ${evalId}`);
        }

        const evaluatorIndex = evaluation.evaluators.findIndex(
          (evaluator: any) => evaluator.metric._id.toString() === metricId
        );

        if (evaluatorIndex === -1) {
          throw new Error(`Metric ${metricId} does not belong to evaluation ${evalId}`);
        }

        await EvaluationSummaryService.generateSingleMetricSummary(
          evaluation,
          metricId,
          evaluatorIndex,
          evaluation.evaluators[evaluatorIndex],
          languageType
        );

        addLog.info('[EvaluationSummary] Worker task completed successfully', {
          jobId: job.id,
          evalId,
          metricId
        });
      } catch (error) {
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
      stalledInterval: 30000,
      maxStalledCount: 3
    }
  );

  worker.on('active', async (job) => {
    if (job?.data) {
      const { evalId, metricId } = job.data;

      addLog.info('[EvaluationSummary] Task started', {
        jobId: job.id,
        evalId,
        metricId
      });

      await SummaryStatusHandler.updateStatus(
        evalId,
        metricId,
        SummaryStatusEnum.generating,
        undefined,
        new Date()
      );
    }
  });

  worker.on('completed', async (job) => {
    if (job?.data) {
      const { evalId, metricId } = job.data;

      addLog.info('[EvaluationSummary] Task completed', {
        jobId: job.id,
        evalId,
        metricId
      });

      await SummaryStatusHandler.updateStatus(
        evalId,
        metricId,
        SummaryStatusEnum.completed,
        undefined,
        new Date()
      );
    }
  });

  worker.on('stalled', async (jobId: string) => {
    try {
      const summaryQueue = getEvaluationSummaryQueue();
      const job = await summaryQueue.getJob(jobId);

      if (job?.data) {
        const { evalId, metricId } = job.data;

        addLog.warn('[EvaluationSummary] Task job stalled, will be retried', {
          jobId,
          evalId,
          metricId
        });

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
            jobId
          }
        );
      }
    } catch (error) {
      addLog.warn(
        '[EvaluationSummary] Task job stalled, will be retried (could not get job data)',
        {
          jobId,
          error
        }
      );
    }
  });

  worker.on('failed', async (job, error) => {
    if (job?.data) {
      const { evalId, metricId } = job.data;

      addLog.warn('[EvaluationSummary] Task failed', {
        jobId: job.id,
        evalId,
        metricId,
        error: error.message
      });

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
