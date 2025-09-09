import { type ErrType } from '../errorCode';
import { i18nT } from '../../../../web/i18n/utils';
/* dataset: 509000 */
export enum SystemErrEnum {
  communityVersionNumLimit = 'communityVersionNumLimit',
  licenseAppAmountLimit = 'licenseAppAmountLimit',
  licenseDatasetAmountLimit = 'licenseDatasetAmountLimit',
  licenseUserAmountLimit = 'licenseUserAmountLimit',
  licenseEvaluationTaskAmountLimit = 'licenseEvaluationTaskAmountLimit',
  licenseEvalDatasetAmountLimit = 'licenseEvalDatasetAmountLimit',
  licenseEvalDatasetDataAmountLimit = 'licenseEvalDatasetDataAmountLimit',
  licenseEvalMetricAmountLimit = 'licenseEvalMetricAmountLimit'
}

const systemErr = [
  {
    statusText: SystemErrEnum.communityVersionNumLimit,
    message: i18nT('common:code_error.system_error.community_version_num_limit')
  },
  {
    statusText: SystemErrEnum.licenseAppAmountLimit,
    message: i18nT('common:code_error.system_error.license_app_amount_limit')
  },
  {
    statusText: SystemErrEnum.licenseDatasetAmountLimit,
    message: i18nT('common:code_error.system_error.license_dataset_amount_limit')
  },
  {
    statusText: SystemErrEnum.licenseUserAmountLimit,
    message: i18nT('common:code_error.system_error.license_user_amount_limit')
  },
  {
    statusText: SystemErrEnum.licenseEvaluationTaskAmountLimit,
    message: i18nT('common:code_error.system_error.license_evaluation_task_amount_limit')
  },
  {
    statusText: SystemErrEnum.licenseEvalDatasetAmountLimit,
    message: i18nT('common:code_error.system_error.license_eval_dataset_amount_limit')
  },
  {
    statusText: SystemErrEnum.licenseEvalDatasetDataAmountLimit,
    message: i18nT('common:code_error.system_error.license_eval_dataset_data_amount_limit')
  },
  {
    statusText: SystemErrEnum.licenseEvalMetricAmountLimit,
    message: i18nT('common:code_error.system_error.license_eval_metric_amount_limit')
  }
];

export default systemErr.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 509000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null
    }
  };
}, {} as ErrType<`${SystemErrEnum}`>);
