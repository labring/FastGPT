import { i18nT } from '@fastgpt/web/i18n/utils';

// 评测结果枚举
export enum EvaluationStatus {
  All = 'all',
  HighQuality = 'high-quality',
  NeedsImprovement = 'optimized',
  Abnormal = 'abnormal',
  NotEvaluated = 'not-evaluated',
  Evaluating = 'evaluating',
  Queuing = 'queuing'
}

// 评测状态映射
export const evaluationStatusMap: Record<EvaluationStatus, string> = {
  [EvaluationStatus.All]: i18nT('dashboard_evaluation:all'),
  [EvaluationStatus.HighQuality]: i18nT('dashboard_evaluation:high_quality'),
  [EvaluationStatus.NeedsImprovement]: i18nT('dashboard_evaluation:needs_improvement'),
  [EvaluationStatus.Abnormal]: i18nT('dashboard_evaluation:abnormal'),
  [EvaluationStatus.NotEvaluated]: i18nT('dashboard_evaluation:not_evaluated'),
  [EvaluationStatus.Evaluating]: i18nT('dashboard_evaluation:evaluating'),
  [EvaluationStatus.Queuing]: i18nT('dashboard_evaluation:queuing')
};

// 评测状态选项（用于筛选）
export const evaluationStatusOptions = Object.entries(evaluationStatusMap).map(([key, value]) => ({
  label: value,
  value: key
}));

// 可修改的评测状态选项（用于修改评测结果弹窗）
export const modifiableEvaluationStatusOptions = [
  {
    label: evaluationStatusMap[EvaluationStatus.HighQuality],
    value: EvaluationStatus.HighQuality
  },
  {
    label: evaluationStatusMap[EvaluationStatus.NeedsImprovement],
    value: EvaluationStatus.NeedsImprovement
  },
  {
    label: evaluationStatusMap[EvaluationStatus.Abnormal],
    value: EvaluationStatus.Abnormal
  }
];
