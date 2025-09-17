import { i18nT } from '../../../web/i18n/utils';

export const evaluationFileErrors = i18nT('dashboard_evaluation:eval_file_check_error');

export enum EvaluationStatusEnum {
  queuing = 'queuing',
  evaluating = 'evaluating',
  completed = 'completed',
  error = 'error'
}

export const EvaluationStatusMap = {
  [EvaluationStatusEnum.queuing]: {
    name: i18nT('dashboard_evaluation:queuing')
  },
  [EvaluationStatusEnum.evaluating]: {
    name: i18nT('dashboard_evaluation:evaluating')
  },
  [EvaluationStatusEnum.completed]: {
    name: i18nT('dashboard_evaluation:completed')
  },
  [EvaluationStatusEnum.error]: {
    name: i18nT('dashboard_evaluation:error')
  }
};
export const EvaluationStatusValues = Object.values(EvaluationStatusEnum);

export enum SummaryStatusEnum {
  pending = 0,
  generating = 1,
  completed = 2,
  failed = 3
}

export const SummaryStatusMap = {
  [SummaryStatusEnum.pending]: {
    name: i18nT('dashboard_evaluation:summary_pending')
  },
  [SummaryStatusEnum.generating]: {
    name: i18nT('dashboard_evaluation:summary_generating')
  },
  [SummaryStatusEnum.completed]: {
    name: i18nT('dashboard_evaluation:summary_done')
  },
  [SummaryStatusEnum.failed]: {
    name: i18nT('dashboard_evaluation:summary_failed')
  }
};

export const SummaryStatusValues = Object.keys(SummaryStatusMap).map(Number);

// Calculation method enumeration
export enum CalculateMethodEnum {
  mean = 0,
  median = 1
}

export const CaculateMethodMap = {
  [CalculateMethodEnum.mean]: {
    name: i18nT('dashboard_evaluation:method_mean')
  },
  [CalculateMethodEnum.median]: {
    name: i18nT('dashboard_evaluation:method_median')
  }
};

export const CaculateMethodValues = Object.keys(CaculateMethodMap).map(Number);

// Score constants
export const PERFECT_SCORE = 100;

// Validation length constants
export const MAX_NAME_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 100;
export const MAX_MODEL_NAME_LENGTH = 100;
export const MAX_USER_INPUT_LENGTH = 1000;
export const MAX_OUTPUT_LENGTH = 4000;
export const MAX_PROMPT_LENGTH = 4000;
export const MAX_CSV_ROWS = 10000;
