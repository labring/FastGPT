import { i18nT } from '../../../../web/i18n/utils';

export enum EvalStatusEnum {
  active = 'active',
  evaluating = 'evaluating',
  waiting = 'waiting',
  error = 'error'
}

export const evaluationFileErrors = i18nT('dashboard_evaluation:eval_file_check_error');
