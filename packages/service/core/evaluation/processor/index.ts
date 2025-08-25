import { addLog } from '../../../common/system/log';
import type { Job } from '../../../common/bullmq';
import type {
  EvaluationTaskJobData,
  EvaluationItemJobData
} from '@fastgpt/global/core/evaluation/type';
import { evaluationItemQueue, getEvaluationTaskWorker, getEvaluationItemWorker } from '../mq';
import { MongoEvaluation, MongoEvalItem } from '../task/schema';
import { MongoEvalDataset } from '../dataset/schema';
import { MongoEvalMetric } from '../metric/schema';
import { createTargetInstance } from '../target';
import { createEvaluatorInstance } from '../evaluator';
import { Types } from 'mongoose';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { checkTeamAIPoints } from '../../../support/permission/teamLimit';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { concatUsage } from '../../../support/wallet/usage/controller';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { MetricResult } from '@fastgpt/global/core/evaluation/type';

// 初始化评估 Workers
export const initEvaluationWorkers = () => {
  addLog.info('Init Evaluation Workers...');

  const taskWorker = getEvaluationTaskWorker(evaluationTaskProcessor);
  const itemWorker = getEvaluationItemWorker(evaluationItemProcessor);

  return { taskWorker, itemWorker };
};

// 处理 AI Points 不足错误
const handleAiPointsError = async (evalId: string, error: any) => {
  if (error === TeamErrEnum.aiPointsNotEnough) {
    await MongoEvaluation.updateOne(
      { _id: new Types.ObjectId(evalId) },
      {
        $set: {
          errorMessage: 'AI Points 余额不足，评估已暂停',
          status: EvaluationStatusEnum.error
        }
      }
    );

    // TODO: 发送通知给团队
    addLog.warn(`[Evaluation] AI Points不足，评估任务暂停: ${evalId}`);
    return;
  }

  throw error;
};

// 完成评估任务 - 简化版本，基于状态枚举统计
const finishEvaluationTask = async (evalId: string) => {
  try {
    // 简化的聚合查询：只基于状态统计
    const [statsResult] = await MongoEvalItem.aggregate([
      {
        $match: { evalId: new Types.ObjectId(evalId) }
      },
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
          // 各状态统计
          completedCount: {
            $sum: { $cond: [{ $eq: ['$status', EvaluationStatusEnum.completed] }, 1, 0] }
          },
          errorCount: {
            $sum: { $cond: [{ $eq: ['$status', EvaluationStatusEnum.error] }, 1, 0] }
          },
          evaluatingCount: {
            $sum: { $cond: [{ $eq: ['$status', EvaluationStatusEnum.evaluating] }, 1, 0] }
          },
          queuingCount: {
            $sum: { $cond: [{ $eq: ['$status', EvaluationStatusEnum.queuing] }, 1, 0] }
          },
          // 只计算成功完成项的平均分
          avgScore: {
            $avg: {
              $cond: [
                { $eq: ['$status', EvaluationStatusEnum.completed] },
                '$evaluator_output.score',
                null
              ]
            }
          }
        }
      }
    ]);

    // 如果没有数据，返回（不应该发生）
    if (!statsResult) {
      addLog.warn(`[Evaluation] 评估任务无评估项数据: ${evalId}`);
      return;
    }

    const {
      totalCount = 0,
      completedCount = 0,
      errorCount = 0,
      evaluatingCount = 0,
      queuingCount = 0,
      avgScore = 0
    } = statsResult;

    // 检查是否真正完成
    const pendingCount = evaluatingCount + queuingCount;
    if (pendingCount > 0) {
      addLog.debug(`[Evaluation] 任务尚未完成: ${evalId}, 待处理项: ${pendingCount}`);
      return; // 还有未完成的项，不更新任务状态
    }

    // 确定任务状态 - 基于状态枚举的简化逻辑
    let taskStatus: EvaluationStatusEnum;
    let errorMessage: string | undefined;

    if (errorCount === 0) {
      // 没有失败项，全部成功
      taskStatus = EvaluationStatusEnum.completed;
    } else if (completedCount === 0) {
      // 没有成功项，全部失败
      taskStatus = EvaluationStatusEnum.error;
      errorMessage = `所有 ${totalCount} 个评估项都失败了`;
    } else {
      // 部分失败
      const successRate = Math.round((completedCount / totalCount) * 100);
      if (successRate >= 80) {
        // 成功率>=80%，标记为完成但记录错误
        taskStatus = EvaluationStatusEnum.completed;
        errorMessage = `${errorCount} 个评估项失败（成功率: ${successRate}%）`;
      } else {
        // 成功率<80%，标记为错误
        taskStatus = EvaluationStatusEnum.error;
        errorMessage = `${errorCount} 个评估项失败，成功率过低: ${successRate}%`;
      }
    }

    // 更新任务状态
    await MongoEvaluation.updateOne(
      { _id: new Types.ObjectId(evalId) },
      {
        $set: {
          finishTime: new Date(),
          avgScore: avgScore != null ? Math.round(avgScore * 100) / 100 : undefined,
          status: taskStatus,
          errorMessage
        }
      }
    );

    addLog.info(
      `[Evaluation] 任务完成: ${evalId}, 状态: ${taskStatus}, 总数: ${totalCount}, ` +
        `成功: ${completedCount}, 失败: ${errorCount}, 平均分: ${avgScore ? avgScore.toFixed(2) : 'N/A'}`
    );
  } catch (error) {
    addLog.error(`[Evaluation] 完成任务时发生错误: ${evalId}`, error);

    // 发生错误时，将任务标记为错误状态
    try {
      await MongoEvaluation.updateOne(
        { _id: new Types.ObjectId(evalId) },
        {
          $set: {
            status: EvaluationStatusEnum.error,
            finishTime: new Date(),
            errorMessage: `任务完成时发生系统错误: ${error instanceof Error ? error.message : '未知错误'}`
          }
        }
      );
    } catch (updateError) {
      addLog.error(`[Evaluation] 更新任务错误状态失败: ${evalId}`, updateError);
    }
  }
};

// 处理评估项错误
const handleEvalItemError = async (evalItemId: string, error: any) => {
  const errorMessage = getErrText(error);

  // 获取当前重试次数
  const evalItem = await MongoEvalItem.findById(evalItemId, 'retry');
  if (!evalItem) {
    addLog.error(`[Evaluation] 评估项不存在: ${evalItemId}`);
    return;
  }

  const newRetryCount = evalItem.retry - 1;
  const newStatus = newRetryCount > 0 ? EvaluationStatusEnum.queuing : EvaluationStatusEnum.error;

  await MongoEvalItem.updateOne(
    { _id: new Types.ObjectId(evalItemId) },
    {
      $set: {
        retry: newRetryCount,
        errorMessage,
        status: newStatus,
        finishTime: newStatus === EvaluationStatusEnum.error ? new Date() : undefined
      }
    }
  );

  addLog.error(`[Evaluation] 评估项处理失败: ${evalItemId}, 剩余重试次数: ${newRetryCount}`, error);
};

// 创建合并的评估用量记录
const createMergedEvaluationUsage = async (params: {
  evalId: string;
  teamId: string;
  tmbId: string;
  usageId: string;
  totalPoints: number;
  type: 'target' | 'metric';
  inputTokens?: number;
  outputTokens?: number;
}) => {
  const { evalId, teamId, tmbId, usageId, totalPoints, type, inputTokens, outputTokens } = params;

  const listIndex = type === 'target' ? 0 : 1;

  await concatUsage({
    billId: usageId,
    teamId,
    tmbId,
    totalPoints,
    inputTokens: inputTokens || 0,
    outputTokens: outputTokens || 0,
    count: type === 'target' ? 1 : 0,
    listIndex
  });

  addLog.debug(`[Evaluation] 记录用量: ${evalId}, ${type}, ${totalPoints}点`);
};

// 评估任务处理器
const evaluationTaskProcessor = async (job: Job<EvaluationTaskJobData>) => {
  const { evalId } = job.data;

  addLog.info(`[Evaluation] 开始处理评估任务: ${evalId}`);

  try {
    // 获取评估任务信息
    const evaluation = await MongoEvaluation.findById(evalId).lean();
    if (!evaluation) {
      addLog.warn(`[Evaluation] 评估任务不存在: ${evalId}`);
      return;
    }

    // 加载数据集
    const dataset = await MongoEvalDataset.findOne({
      _id: new Types.ObjectId(evaluation.datasetId),
      teamId: evaluation.teamId
    }).lean();

    if (!dataset) {
      throw new Error('数据集加载失败');
    }

    // 验证 target 和 evaluators 配置
    if (!evaluation.target || !evaluation.target.type || !evaluation.target.config) {
      throw new Error('Target 配置无效');
    }

    if (!evaluation.evaluators || evaluation.evaluators.length === 0) {
      throw new Error('Evaluators 配置无效');
    }

    // 为每个 dataItem 和每个 evaluator 创建评估项（原子性结构）
    const evalItems = [];
    for (const dataItem of dataset.dataItems) {
      for (const evaluator of evaluation.evaluators) {
        evalItems.push({
          evalId,
          dataItem,
          target: evaluation.target,
          evaluator,
          status: EvaluationStatusEnum.queuing,
          retry: 3
        });
      }
    }

    // 批量插入评估项
    const insertedItems = await MongoEvalItem.insertMany(evalItems);
    addLog.info(`[Evaluation] 创建了 ${insertedItems.length} 个原子评估项`);

    // 提交到评估项队列进行并发处理
    const jobs = insertedItems.map((item, index) => ({
      name: `eval_item_${evalId}_${index}`,
      data: {
        evalId,
        evalItemId: item._id.toString()
      },
      opts: {
        delay: index * 100 // 添加小延迟避免同时启动过多任务
      }
    }));

    await evaluationItemQueue.addBulk(jobs);

    addLog.info(`[Evaluation] 任务分解完成: ${evalId}, 提交 ${jobs.length} 个评估项到队列`);
  } catch (error) {
    addLog.error(`[Evaluation] 任务处理失败: ${evalId}`, error);

    // 标记任务失败
    await MongoEvaluation.updateOne(
      { _id: new Types.ObjectId(evalId) },
      {
        $set: {
          errorMessage: getErrText(error),
          status: EvaluationStatusEnum.error,
          finishTime: new Date()
        }
      }
    );
  }
};

// 评估项处理器
const evaluationItemProcessor = async (job: Job<EvaluationItemJobData>) => {
  const { evalId, evalItemId } = job.data;

  addLog.debug(`[Evaluation] 开始处理评估项: ${evalItemId}`);

  try {
    // 获取评估项信息
    const evalItem = await MongoEvalItem.findById(evalItemId);
    if (!evalItem) {
      throw new Error('评估项不存在');
    }

    // 获取 evaluation 信息用于检查 AI Points
    const evaluation = await MongoEvaluation.findById(evalId, 'teamId tmbId usageId');
    if (!evaluation) {
      throw new Error('评估任务不存在');
    }

    // 检查 AI Points
    await checkTeamAIPoints(evaluation.teamId);

    // 更新状态为处理中
    await MongoEvalItem.updateOne(
      { _id: new Types.ObjectId(evalItemId) },
      { $set: { status: EvaluationStatusEnum.evaluating } }
    );

    // 1. 调用评估目标
    const targetInstance = createTargetInstance(evalItem.target);
    const output = await targetInstance.execute({
      userInput: evalItem.dataItem.userInput,
      context: evalItem.dataItem.context,
      globalVariables: evalItem.dataItem.globalVariables
    });

    // 记录目标调用的用量
    if (output.usage) {
      const totalPoints = output.usage.reduce(
        (sum: number, item: any) => sum + (item.totalPoints || 0),
        0
      );
      await createMergedEvaluationUsage({
        evalId,
        teamId: evaluation.teamId,
        tmbId: evaluation.tmbId,
        usageId: evaluation.usageId,
        totalPoints,
        type: 'target'
      });
    }

    // 2. 执行评估器
    let result: MetricResult;
    let totalMetricPoints = 0;

    try {
      const evaluatorInstance = createEvaluatorInstance(evalItem.evaluator);

      result = await evaluatorInstance.evaluate({
        userInput: evalItem.dataItem.userInput,
        expectedOutput: evalItem.dataItem.expectedOutput,
        actualOutput: output.actualOutput,
        context: evalItem.dataItem.context,
        retrievalContext: output.retrievalContext
      });

      // 如果是 AI 模型指标，记录用量
      if (evalItem.evaluator.metric.type === 'ai_model' && result.details?.usage) {
        totalMetricPoints += result.details.usage.totalPoints || 0;
      }
    } catch (error) {
      // 评估器失败
      result = {
        metricId: evalItem.evaluator.metric._id,
        metricName: evalItem.evaluator.metric.name,
        score: 0,
        error: getErrText(error)
      };
    }

    // 记录指标评估的用量
    if (totalMetricPoints > 0) {
      await createMergedEvaluationUsage({
        evalId,
        teamId: evaluation.teamId,
        tmbId: evaluation.tmbId,
        usageId: evaluation.usageId,
        totalPoints: totalMetricPoints,
        type: 'metric'
      });
    }

    // 3. 存储结果
    await MongoEvalItem.updateOne(
      { _id: new Types.ObjectId(evalItemId) },
      {
        $set: {
          target_output: output,
          evaluator_output: result,
          status: EvaluationStatusEnum.completed,
          finishTime: new Date()
        }
      }
    );

    addLog.debug(`[Evaluation] 评估项完成: ${evalItemId}, 分数: ${result.score}`);
  } catch (error) {
    await handleEvalItemError(evalItemId, error);

    // 如果是 AI Points 不足，暂停整个任务
    if (error === TeamErrEnum.aiPointsNotEnough) {
      await handleAiPointsError(evalId, error);
    }
  }

  // 在 try-catch 之后检查是否所有评估项都完成了
  try {
    const pendingCount = await MongoEvalItem.countDocuments({
      evalId: new Types.ObjectId(evalId),
      status: { $in: [EvaluationStatusEnum.queuing, EvaluationStatusEnum.evaluating] }
    });

    if (pendingCount === 0) {
      await finishEvaluationTask(evalId);
    }
  } catch (finishError) {
    addLog.error(`[Evaluation] 检查任务完成状态时发生错误: ${evalId}`, finishError);
  }
};
