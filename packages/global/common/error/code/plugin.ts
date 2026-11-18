import { type ErrType } from '../errorCode';
import { i18nT } from '../../i18n/utils';
/* dataset: 508000 */
export enum PluginErrEnum {
  unExist = 'pluginUnExist',
  unAuth = 'pluginUnAuth',
  disableModerationBeforeDelete = 'Disable the moderation plugin before deleting it'
}

const errList = [
  {
    statusText: PluginErrEnum.unExist,
    message: i18nT('common:error.tool_not_exist')
  },
  {
    statusText: PluginErrEnum.unAuth,
    message: i18nT('common:code_error.plugin_error.un_auth')
  },
  {
    statusText: PluginErrEnum.disableModerationBeforeDelete,
    message: i18nT('admin:moderation.disable_before_delete'),
    httpStatus: 400
  }
];

export default errList.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 508000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null,
      ...(cur.httpStatus !== undefined ? { httpStatus: cur.httpStatus } : {})
    }
  };
}, {} as ErrType<`${PluginErrEnum}`>);
