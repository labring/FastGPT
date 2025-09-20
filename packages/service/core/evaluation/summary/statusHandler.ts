import { MongoEvaluation } from '../task/schema';
import { SummaryStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { addLog } from '../../../common/system/log';

// 状态更新处理器
export class SummaryStatusHandler {
  /**
   * 更新评估总结状态
   * @param evalId 评估任务ID
   * @param metricId 指标ID
   * @param status 新状态
   * @param errorReason 错误原因（可选）
   * @param timestamp 时间戳（可选）
   */
  static async updateStatus(
    evalId: string,
    metricId: string,
    status: SummaryStatusEnum,
    errorReason?: string,
    timestamp?: Date
  ): Promise<boolean> {
    try {
      const evaluation = await MongoEvaluation.findById(evalId).lean();
      if (!evaluation) {
        addLog.warn('[SummaryStatusHandler] Evaluation not found', { evalId, metricId });
        return false;
      }

      const evaluatorIndex = evaluation.evaluators.findIndex(
        (evaluator: any) => evaluator.metric._id.toString() === metricId
      );

      if (evaluatorIndex === -1) {
        addLog.warn('[SummaryStatusHandler] Metric not found in evaluation', { evalId, metricId });
        return false;
      }

      // 构建更新对象
      const updateObj: Record<string, any> = {
        [`summaryConfigs.${evaluatorIndex}.summaryStatus`]: status
      };

      // 根据状态设置不同的字段
      switch (status) {
        case SummaryStatusEnum.generating:
          updateObj[`summaryConfigs.${evaluatorIndex}.errorReason`] = '';
          break;

        case SummaryStatusEnum.completed:
          updateObj[`summaryConfigs.${evaluatorIndex}.errorReason`] = '';
          break;

        case SummaryStatusEnum.failed:
          updateObj[`summaryConfigs.${evaluatorIndex}.errorReason`] =
            errorReason || 'Unknown error';
          break;
      }

      await MongoEvaluation.updateOne({ _id: evalId }, { $set: updateObj });

      addLog.info('[SummaryStatusHandler] Status updated successfully', {
        evalId,
        metricId,
        status,
        errorReason,
        evaluatorIndex,
        timestamp: timestamp || new Date()
      });

      return true;
    } catch (error) {
      addLog.error('[SummaryStatusHandler] Failed to update status', {
        evalId,
        metricId,
        status,
        error
      });
      return false;
    }
  }

  /**
   * 批量更新多个指标的状态
   * @param evalId 评估任务ID
   * @param updates 更新列表
   */
  static async batchUpdateStatus(
    evalId: string,
    updates: Array<{
      metricId: string;
      status: SummaryStatusEnum;
      errorReason?: string;
      timestamp?: Date;
    }>
  ): Promise<boolean[]> {
    const results = await Promise.allSettled(
      updates.map((update) =>
        this.updateStatus(
          evalId,
          update.metricId,
          update.status,
          update.errorReason,
          update.timestamp
        )
      )
    );

    return results.map((result) => result.status === 'fulfilled' && result.value);
  }

  /**
   * 获取指标的当前状态
   * @param evalId 评估任务ID
   * @param metricId 指标ID
   */
  static async getStatus(evalId: string, metricId: string): Promise<SummaryStatusEnum | null> {
    try {
      const evaluation = await MongoEvaluation.findById(evalId).lean();
      if (!evaluation) {
        return null;
      }

      const evaluatorIndex = evaluation.evaluators.findIndex(
        (evaluator: any) => evaluator.metric._id.toString() === metricId
      );

      if (evaluatorIndex === -1) {
        return null;
      }

      return (
        evaluation.summaryConfigs?.[evaluatorIndex]?.summaryStatus || SummaryStatusEnum.pending
      );
    } catch (error) {
      addLog.error('[SummaryStatusHandler] Failed to get status', {
        evalId,
        metricId,
        error
      });
      return null;
    }
  }
}
