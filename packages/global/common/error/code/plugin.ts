import { ErrType } from '../errorCode';
import { i18nT } from '../../../../web/i18n/utils';
/* dataset: 508000 */
export enum PluginErrEnum {
  unExist = 'pluginUnExist',
  unAuth = 'pluginUnAuth'
}

const errList = [
  {
    statusText: PluginErrEnum.unExist,
    message: i18nT('common:code_error.plugin_error.not_exist')
  },
  {
    statusText: PluginErrEnum.unAuth,
    message: i18nT('common:code_error.plugin_error.un_auth')
  }
];

export default errList.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 508000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null
    }
  };
}, {} as ErrType<`${PluginErrEnum}`>);
