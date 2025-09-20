import { getQueue } from '../../../common/bullmq';
import { QueueNames } from '../../../common/bullmq';
import { addLog } from '../../../common/system/log';

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

// 添加评估总结任务到队列
export async function addSummaryTaskToQueue(evalId: string, metricIds: string[]): Promise<void> {
  try {
    const queue = getEvaluationSummaryQueue();

    // 为每个metricId创建单独的job
    const addPromises = metricIds.map((metricId) =>
      queue.add(
        'generateSummary',
        {
          evalId,
          metricId,
          timestamp: Date.now()
        },
        {
          attempts: 1, // 不自动重试，由用户通过API主动重试
          removeOnComplete: {
            count: 5
          },
          removeOnFail: {
            count: 10
          },
          // 使用evalId + metricId作为jobId，防止重复任务
          jobId: `${evalId}_${metricId}`
        }
      )
    );

    await Promise.all(addPromises);

    addLog.info('[EvaluationSummary] Tasks added to queue successfully', {
      evalId,
      metricIds,
      metricCount: metricIds.length
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
