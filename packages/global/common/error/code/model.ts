import { type ErrorHttpStatus, type ErrType } from '../errorCode';
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
  noAvailableChannel = 'modelNoAvailableChannel',
  teamModelDisabled = 'teamModelDisabled'
}

const modelErrList: Array<{
  statusText: ModelErrEnum;
  message: string;
  httpStatus: ErrorHttpStatus;
}> = [
  {
    statusText: ModelErrEnum.unExist,
    message: i18nT('common:model_delisted'),
    httpStatus: 404
  },
  {
    statusText: ModelErrEnum.unConfigured,
    message: i18nT('common:not_model_config'),
    // 服务端默认模型未配置属于实例侧 5xx 故障；请求缺少模型引用时由模型句柄抛 UserConfigError 覆盖为 400。
    httpStatus: 500
  },
  {
    statusText: ModelErrEnum.alreadyExists,
    message: i18nT('common:model_id_already_exists'),
    httpStatus: 409
  },
  {
    statusText: ModelErrEnum.probeTaskRunning,
    message: i18nT('common:model_probe_task_running'),
    httpStatus: 409
  },
  {
    statusText: ModelErrEnum.unAuthModel,
    message: i18nT('common:code_error.model_error.un_auth_model'),
    httpStatus: 403
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
  },
  {
    statusText: ModelErrEnum.teamModelDisabled,
    message: i18nT('common:code_error.model_error.team_model_disabled'),
    httpStatus: 403
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
      httpStatus: cur.httpStatus
    }
  }),
  {} as ErrType<`${ModelErrEnum}`>
);
