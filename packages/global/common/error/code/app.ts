import { type ErrType } from '../errorCode';
import { i18nT } from '../../i18n/utils';
/* dataset: 502000 */
export enum AppErrEnum {
  unExist = 'appUnExist',
  unAuthApp = 'unAuthApp',
  invalidOwner = 'invalidOwner',
  invalidAppType = 'invalidAppType',
  canNotEditAdminPermission = 'canNotEditAdminPermission',
  workflowBuilderVersionExpired = 'workflowBuilderVersionExpired',
  workflowBuilderVersionNotFound = 'workflowBuilderVersionNotFound'
}
const appErrList = [
  {
    statusText: AppErrEnum.unExist,
    message: i18nT('common:code_error.app_error.not_exist')
  },
  {
    statusText: AppErrEnum.unAuthApp,
    message: i18nT('common:code_error.app_error.un_auth_app')
  },
  {
    statusText: AppErrEnum.invalidOwner,
    message: i18nT('common:code_error.app_error.invalid_owner')
  },
  {
    statusText: AppErrEnum.invalidAppType,
    message: i18nT('common:code_error.app_error.invalid_app_type')
  },
  {
    statusText: AppErrEnum.canNotEditAdminPermission,
    message: i18nT('common:code_error.app_error.can_not_edit_admin_permission')
  },
  {
    statusText: AppErrEnum.workflowBuilderVersionExpired,
    message: i18nT('workflow:workflow_builder_version_expired_toast'),
    httpStatus: 410
  },
  {
    statusText: AppErrEnum.workflowBuilderVersionNotFound,
    message: i18nT('workflow:workflow_builder_version_not_found_toast'),
    httpStatus: 404
  }
];
export default appErrList.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 502000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null,
      ...('httpStatus' in cur ? { httpStatus: cur.httpStatus } : {})
    }
  };
}, {} as ErrType<`${AppErrEnum}`>);
