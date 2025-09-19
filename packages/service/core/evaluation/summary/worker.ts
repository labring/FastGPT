import { getWorker, QueueNames } from '../../../common/bullmq';
import { addLog } from '../../../common/system/log';
import { MongoEvaluation } from '../task/schema';
import { SummaryStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import type { EvaluationSchemaType } from '@fastgpt/global/core/evaluation/type';
import { type EvaluationSummaryJobData } from './queue';
import { EvaluationSummaryService } from './index';

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

        // Worker开始处理时，更新状态为generating
        await MongoEvaluation.updateOne(
          { _id: evalId },
          {
            $set: {
              [`summaryConfigs.${evaluatorTask.evaluatorIndex}.summaryStatus`]:
                SummaryStatusEnum.generating,
              [`summaryConfigs.${evaluatorTask.evaluatorIndex}.errorReason`]: undefined
            }
          }
        );

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
        // Worker处理失败时直接设置为failed状态
        try {
          const evaluation = await MongoEvaluation.findById(evalId).lean();
          if (evaluation) {
            const evaluatorIndex = evaluation.evaluators.findIndex(
              (evaluator: any) => evaluator.metric._id.toString() === metricId
            );

            if (evaluatorIndex !== -1) {
              await MongoEvaluation.updateOne(
                { _id: evalId },
                {
                  $set: {
                    [`summaryConfigs.${evaluatorIndex}.summaryStatus`]: SummaryStatusEnum.failed,
                    [`summaryConfigs.${evaluatorIndex}.errorReason`]:
                      error instanceof Error ? error.message : 'Unknown error'
                  }
                }
              );

              addLog.info('[EvaluationSummary] Updated status to failed', {
                evalId,
                metricId,
                errorReason: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          }
        } catch (statusUpdateError) {
          addLog.error('[EvaluationSummary] Failed to update status on error', {
            evalId,
            metricId,
            statusUpdateError
          });
        }

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
      concurrency: Number(process.env.EVAL_SUMMARY_CONCURRENCY) || 1,
      removeOnComplete: {
        count: 5
      },
      removeOnFail: {
        count: 10
      }
    }
  );

  // 监听任务失败事件
  worker.on('failed', async (job, error) => {
    if (job?.data) {
      const { evalId, metricId } = job.data;

      addLog.warn('[EvaluationSummary] Task failed', {
        jobId: job.id,
        evalId,
        metricId,
        error: error.message
      });

      // 确保数据库状态为failed（双重保险）
      try {
        const evaluation = await MongoEvaluation.findById(evalId).lean();
        if (evaluation) {
          const evaluatorIndex = evaluation.evaluators.findIndex(
            (evaluator: any) => evaluator.metric._id.toString() === metricId
          );

          if (evaluatorIndex !== -1) {
            await MongoEvaluation.updateOne(
              { _id: evalId },
              {
                $set: {
                  [`summaryConfigs.${evaluatorIndex}.summaryStatus`]: SummaryStatusEnum.failed,
                  [`summaryConfigs.${evaluatorIndex}.errorReason`]: error.message
                }
              }
            );

            addLog.info('[EvaluationSummary] Ensured failed status in database', {
              evalId,
              metricId
            });
          }
        }
      } catch (statusUpdateError) {
        addLog.error('[EvaluationSummary] Failed to ensure failed status', {
          evalId,
          metricId,
          error: statusUpdateError
        });
      }
    }
  });

  addLog.info('[EvaluationSummary] Worker created successfully');
  return worker;
}
