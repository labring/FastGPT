import { MongoEvaluation } from '../task/schema';
import { SummaryStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { addLog } from '../../../common/system/log';

export class SummaryStatusHandler {
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

      const updateObj: Record<string, any> = {
        [`summaryData.summaryConfigs.${evaluatorIndex}.summaryStatus`]: status
      };

      switch (status) {
        case SummaryStatusEnum.generating:
          updateObj[`summaryData.summaryConfigs.${evaluatorIndex}.errorReason`] = '';
          break;

        case SummaryStatusEnum.completed:
          updateObj[`summaryData.summaryConfigs.${evaluatorIndex}.errorReason`] = '';
          break;

        case SummaryStatusEnum.failed:
          updateObj[`summaryData.summaryConfigs.${evaluatorIndex}.errorReason`] =
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
        evaluation.summaryData?.summaryConfigs?.[evaluatorIndex]?.summaryStatus ||
        SummaryStatusEnum.pending
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
