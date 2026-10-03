import { type ErrType } from '../errorCode';
import { i18nT } from '../../i18n/utils';

/* model: 513000 */
export enum ModelErrEnum {
  unExist = 'modelUnExist',
  unConfigured = 'modelUnConfigured',
  alreadyExists = 'modelAlreadyExists',
  probeTaskRunning = 'modelProbeTaskRunning',
  unAuthModel = 'unAuthModel',
  invalidModelConfig = 'invalidModelConfig',
  rootOnlyPermit = 'rootOnlyPermit',
  unAuthChannel = 'unAuthChannel',
  channelNotExist = 'channelNotExist',
  channelNameConflict = 'channelNameConflict',
  noAvailableChannel = 'modelNoAvailableChannel'
}

const modelErrList = [
  {
    statusText: ModelErrEnum.unExist,
    message: i18nT('common:model_delisted')
  },
  {
    statusText: ModelErrEnum.unConfigured,
    message: i18nT('common:not_model_config')
  },
  {
    statusText: ModelErrEnum.alreadyExists,
    message: i18nT('common:model_id_already_exists')
  },
  {
    statusText: ModelErrEnum.probeTaskRunning,
    message: i18nT('common:model_probe_task_running')
  },
  {
    statusText: ModelErrEnum.unAuthModel,
    message: i18nT('common:code_error.model_error.un_auth_model')
  },
  {
    statusText: ModelErrEnum.invalidModelConfig,
    message: i18nT('common:code_error.model_error.invalid_config'),
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
    statusText: ModelErrEnum.channelNameConflict,
    message: i18nT('config_model:channel_name_duplicate'),
    httpStatus: 409
  },
  {
    statusText: ModelErrEnum.noAvailableChannel,
    message: i18nT('common:code_error.model_error.no_available_channel'),
    httpStatus: 404
  }
];

export default modelErrList.reduce(
  (acc, cur, index) => ({
    ...acc,
    [cur.statusText]: {
      code: 513000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null,
      ...(cur.httpStatus !== undefined ? { httpStatus: cur.httpStatus } : {})
    }
  }),
  {} as ErrType<`${ModelErrEnum}`>
);
