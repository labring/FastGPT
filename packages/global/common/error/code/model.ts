import { type ErrType } from '../errorCode';
import { i18nT } from '../../i18n/utils';

export enum ModelErrEnum {
  unExist = 'modelUnExist',
  unAuthModel = 'unAuthModel',
  canNotEditAdminPermission = 'canNotEditModelAdminPermission',
  invalidModelId = 'invalidModelId',
  invalidModelConfig = 'invalidModelConfig',
  modelNameConflict = 'modelNameConflict',
  systemModelReadonly = 'systemModelReadonly',
  noFieldsToUpdate = 'noFieldsToUpdate',
  rootOnlyPermit = 'rootOnlyPermit',
  unAuthChannel = 'unAuthChannel',
  channelNotExist = 'channelNotExist',
  noAvailableChannel = 'modelNoAvailableChannel',
  modelDisabled = 'modelDisabled'
}

const modelErrList = [
  { statusText: ModelErrEnum.unExist, message: i18nT('common:code_error.model_error.not_exist') },
  {
    statusText: ModelErrEnum.unAuthModel,
    message: i18nT('common:code_error.model_error.un_auth_model')
  },
  {
    statusText: ModelErrEnum.canNotEditAdminPermission,
    message: i18nT('common:code_error.model_error.can_not_edit_admin_permission')
  },
  {
    statusText: ModelErrEnum.invalidModelId,
    message: i18nT('common:code_error.model_error.invalid_id'),
    httpStatus: 400
  },
  {
    statusText: ModelErrEnum.invalidModelConfig,
    message: i18nT('common:code_error.model_error.invalid_config'),
    httpStatus: 400
  },
  {
    statusText: ModelErrEnum.modelNameConflict,
    message: i18nT('common:code_error.model_error.name_conflict'),
    httpStatus: 409
  },
  {
    statusText: ModelErrEnum.systemModelReadonly,
    message: i18nT('common:code_error.model_error.system_model_readonly'),
    httpStatus: 403
  },
  {
    statusText: ModelErrEnum.noFieldsToUpdate,
    message: i18nT('common:code_error.model_error.no_fields_to_update'),
    httpStatus: 400
  },
  {
    statusText: ModelErrEnum.rootOnlyPermit,
    message: i18nT('common:code_error.model_error.root_only_permit'),
    httpStatus: 403
  },
  {
    statusText: ModelErrEnum.unAuthChannel,
    message: i18nT('common:code_error.model_error.un_auth_channel'),
    httpStatus: 403
  },
  {
    statusText: ModelErrEnum.channelNotExist,
    message: i18nT('common:code_error.model_error.channel_not_exist'),
    httpStatus: 404
  },
  {
    statusText: ModelErrEnum.noAvailableChannel,
    message: i18nT('common:code_error.model_error.no_available_channel'),
    httpStatus: 404
  },
  {
    statusText: ModelErrEnum.modelDisabled,
    message: i18nT('common:code_error.model_error.model_disabled'),
    httpStatus: 403
  }
];

export default modelErrList.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 513000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null,
      ...(cur.httpStatus !== undefined ? { httpStatus: cur.httpStatus } : {})
    }
  };
}, {} as ErrType<`${ModelErrEnum}`>);
