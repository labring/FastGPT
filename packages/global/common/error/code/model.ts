import { type ErrType } from '../errorCode';
import { i18nT } from '../../i18n/utils';

/* model: 513000 */
export enum ModelErrEnum {
  unExist = 'modelUnExist',
  unConfigured = 'modelUnConfigured'
}

const modelErrList = [
  {
    statusText: ModelErrEnum.unExist,
    message: i18nT('common:model_delisted')
  },
  {
    statusText: ModelErrEnum.unConfigured,
    message: i18nT('common:not_model_config')
  }
];

export default modelErrList.reduce(
  (acc, cur, index) => ({
    ...acc,
    [cur.statusText]: {
      code: 513000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null
    }
  }),
  {} as ErrType<`${ModelErrEnum}`>
);
