import { getQueue } from '../../../common/bullmq';
import { QueueNames } from '../../../common/bullmq';
import { addLog } from '../../../common/system/log';
import { SummaryStatusHandler } from './statusHandler';
import { SummaryStatusEnum } from '@fastgpt/global/core/evaluation/constants';

// 评估总结任务数据接口
export interface EvaluationSummaryJobData {
  evalId: string;
  metricId: string;
  timestamp: number;
}

// 获取评估总结队列
export function getEvaluationSummaryQueue() {
  return getQueue<EvaluationSummaryJobData>(QueueNames.evaluationSummary);
}

// 检查是否有运行中的 summary 任务
async function checkActiveSummaryJob(evalId: string, metricId: string): Promise<boolean> {
  try {
    const queue = getEvaluationSummaryQueue();

    // 获取所有运行中的任务
    const activeJobs = await queue.getJobs(['active', 'waiting', 'delayed', 'prioritized']);

    // 检查是否有匹配的任务
    const existingJob = activeJobs.find(
      (job) => job.data.evalId === evalId && job.data.metricId === metricId
    );

    return !!existingJob;
  } catch (error) {
    addLog.error('[EvaluationSummary] Failed to check active summary job', {
      evalId,
      metricId,
      error
    });
    return false; // 检查失败时假设没有运行中的任务
  }
}

// 添加评估总结任务到队列
export async function addSummaryTaskToQueue(evalId: string, metricIds: string[]): Promise<void> {
  try {
    const queue = getEvaluationSummaryQueue();

    // 为每个metricId创建单独的job
    const addPromises = metricIds.map(async (metricId) => {
      // 检查是否已有运行中的任务
      const hasActiveJob = await checkActiveSummaryJob(evalId, metricId);
      if (hasActiveJob) {
        addLog.warn('[EvaluationSummary] Task already in progress, skipping', {
          evalId,
          metricId
        });
        return null; // 跳过重复任务
      }

      // 设置 pending 状态
      await SummaryStatusHandler.updateStatus(
        evalId,
        metricId,
        SummaryStatusEnum.pending,
        undefined,
        new Date()
      );

      addLog.info('[EvaluationSummary] Adding new task to queue', {
        evalId,
        metricId
      });

      // 参考 taskitem 的写法：不指定 jobId，使用 deduplication 去重
      return queue.add(
        'generateSummary',
        {
          evalId,
          metricId,
          timestamp: Date.now()
        },
        {
          attempts: 1, // 不自动重试，由用户通过API主动重试
          removeOnComplete: {
            count: 100 // 保留最近100个完成的任务，便于查看历史
          },
          removeOnFail: {
            count: 50 // 保留最近50个失败的任务，便于调试
          },
          deduplication: {
            id: `${evalId}_${metricId}`, // 使用 evalId+metricId 去重
            ttl: 5000 // 5秒内防止重复提交
          }
        }
      );
    });

    const results = await Promise.all(addPromises);
    const successfullyAdded = results.filter(Boolean).length;
    const skipped = metricIds.length - successfullyAdded;

    addLog.info('[EvaluationSummary] Task successfully added to queue', {
      evalId,
      totalRequested: metricIds.length,
      validMetricsCount: successfullyAdded,
      skippedCount: skipped
    });
  } catch (error) {
    addLog.error('[EvaluationSummary] Failed to add tasks to queue', {
      evalId,
      metricIds,
      error
    });
    throw error;
  }
}
