import { i18nT } from '@fastgpt/web/i18n/utils';
import {
  EvalDatasetDataQualityStatusEnum,
  EvalDatasetDataQualityResultEnum
} from '@fastgpt/global/core/evaluation/dataset/constants';

// 评测结果枚举（用于前端状态管理和筛选）
export enum EvaluationStatus {
  All = 'all',
  HighQuality = EvalDatasetDataQualityResultEnum.highQuality,
  NeedsImprovement = EvalDatasetDataQualityResultEnum.needsOptimization,
  Abnormal = EvalDatasetDataQualityStatusEnum.error,
  NotEvaluated = EvalDatasetDataQualityStatusEnum.unevaluated,
  Evaluating = EvalDatasetDataQualityStatusEnum.evaluating,
  Queuing = EvalDatasetDataQualityStatusEnum.queuing
}

// 评测列表状态映射（含任务状态和结果）
export const evaluationStatusMap: Record<EvaluationStatus, string> = {
  [EvaluationStatus.All]: i18nT('dashboard_evaluation:all'),
  [EvaluationStatus.NeedsImprovement]: i18nT('dashboard_evaluation:needs_improvement'),
  [EvaluationStatus.HighQuality]: i18nT('dashboard_evaluation:high_quality'),
  [EvaluationStatus.Abnormal]: i18nT('dashboard_evaluation:abnormal'),
  [EvaluationStatus.NotEvaluated]: i18nT('dashboard_evaluation:not_evaluated'),
  [EvaluationStatus.Evaluating]: i18nT('dashboard_evaluation:detail_evaluating'),
  [EvaluationStatus.Queuing]: i18nT('dashboard_evaluation:queuing')
};

// 评测状态选项（用于筛选）
export const evaluationStatusOptions = Object.entries(evaluationStatusMap).map(([key, value]) => {
  return {
    label: value,
    value: key
  };
});

// 可修改的评测状态选项（用于修改评测结果弹窗）
export const modifiableEvaluationStatusOptions = [
  {
    label: evaluationStatusMap[EvaluationStatus.HighQuality],
    value: EvaluationStatus.HighQuality,
    colorSchema: 'green'
  },
  {
    label: evaluationStatusMap[EvaluationStatus.NeedsImprovement],
    value: EvaluationStatus.NeedsImprovement,
    colorSchema: 'yellow'
  }
];
