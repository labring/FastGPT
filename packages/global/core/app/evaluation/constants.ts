import { i18nT } from '../../../../web/i18n/utils';

export const evaluationFileErrors = i18nT('dashboard_evaluation:eval_file_check_error');

export enum EvaluationStatusEnum {
  queuing = 0,
  evaluating = 1,
  completed = 2
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
  }
};
export const EvaluationStatusValues = Object.keys(EvaluationStatusMap).map(Number);
