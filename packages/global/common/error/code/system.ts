import { ErrType } from '../errorCode';
import { i18nT } from '../../../../web/i18n/utils';
/* dataset: 509000 */
export enum SystemErrEnum {
  communityVersionNumLimit = 'communityVersionNumLimit'
}

const systemErr = [
  {
    statusText: SystemErrEnum.communityVersionNumLimit,
    message: i18nT('common:code_error.system_error.community_version_num_limit')
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
