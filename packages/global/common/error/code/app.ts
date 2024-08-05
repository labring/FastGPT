import { ErrType } from '../errorCode';
import { i18nT } from '../../../../web/i18n/utils';
/* dataset: 502000 */
export enum AppErrEnum {
  unExist = 'appUnExist',
  unAuthApp = 'unAuthApp'
}
const appErrList = [
  {
    statusText: AppErrEnum.unExist,
    message: i18nT('common:code_error.app_error.not_exist')
  },
  {
    statusText: AppErrEnum.unAuthApp,
    message: i18nT('common:code_error.app_error.un_auth_app')
  }
];
export default appErrList.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 502000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null
    }
  };
}, {} as ErrType<`${AppErrEnum}`>);
