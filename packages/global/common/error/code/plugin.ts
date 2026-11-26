import { type ErrorHttpStatus, type ErrType } from '../errorCode';
import { i18nT } from '../../i18n/utils';
/* dataset: 508000 */
export enum PluginErrEnum {
  unExist = 'pluginUnExist',
  unAuth = 'pluginUnAuth',
  disableModerationBeforeDelete = 'Disable the moderation plugin before deleting it'
}

const errList: Array<{
  statusText: PluginErrEnum;
  message: string;
  httpStatus: ErrorHttpStatus;
}> = [
  {
    statusText: PluginErrEnum.unExist,
    message: i18nT('common:error.tool_not_exist'),
    httpStatus: 404
  },
  {
    statusText: PluginErrEnum.unAuth,
    message: i18nT('common:code_error.plugin_error.un_auth'),
    httpStatus: 403
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
      httpStatus: cur.httpStatus
    }
  };
}, {} as ErrType<`${PluginErrEnum}`>);
