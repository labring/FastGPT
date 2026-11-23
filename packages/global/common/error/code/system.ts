import { type ErrorHttpStatus, type ErrType } from '../errorCode';
import { i18nT } from '../../i18n/utils';
/* dataset: 509000 */
export enum SystemErrEnum {
  communityVersionNumLimit = 'communityVersionNumLimit',
  commercialFeature = 'commercialFeature',
  licenseAppAmountLimit = 'licenseAppAmountLimit',
  licenseDatasetAmountLimit = 'licenseDatasetAmountLimit',
  licenseUserAmountLimit = 'licenseUserAmountLimit'
}

const systemErr: Array<{
  statusText: SystemErrEnum;
  message: string;
  httpStatus: ErrorHttpStatus;
}> = [
  {
    statusText: SystemErrEnum.communityVersionNumLimit,
    message: i18nT('common:code_error.system_error.community_version_num_limit'),
    httpStatus: 403
  },
  {
    statusText: SystemErrEnum.commercialFeature,
    message: i18nT('common:code_error.system_error.commercial_feature'),
    httpStatus: 403
  },
  {
    statusText: SystemErrEnum.licenseAppAmountLimit,
    message: i18nT('common:code_error.system_error.license_app_amount_limit'),
    httpStatus: 403
  },
  {
    statusText: SystemErrEnum.licenseDatasetAmountLimit,
    message: i18nT('common:code_error.system_error.license_dataset_amount_limit'),
    httpStatus: 403
  },
  {
    statusText: SystemErrEnum.licenseUserAmountLimit,
    message: i18nT('common:code_error.system_error.license_user_amount_limit'),
    httpStatus: 403
  }
];

export default systemErr.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 509000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null,
      httpStatus: cur.httpStatus
    }
  };
}, {} as ErrType<`${SystemErrEnum}`>);
