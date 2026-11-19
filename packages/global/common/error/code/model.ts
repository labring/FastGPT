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
  noAvailableChannel = 'modelNoAvailableChannel',
  teamModelDisabled = 'teamModelDisabled',
  embeddingEmptyInput = 'modelEmbeddingEmptyInput',
  privateEndpointBlocked = 'modelPrivateEndpointBlocked',
  authFailed = 'modelAuthFailed',
  upstreamQuotaExceeded = 'modelUpstreamQuotaExceeded',
  permissionDenied = 'modelPermissionDenied',
  modelNotFound = 'modelNotFound',
  contentBlocked = 'modelContentBlocked',
  inputTooLong = 'modelInputTooLong',
  invalidImage = 'modelInvalidImage',
  imageDownloadFailed = 'modelImageDownloadFailed',
  invalidRequest = 'modelInvalidRequest',
  rateLimited = 'modelRateLimited',
  requestTimeout = 'modelRequestTimeout',
  serviceUnavailable = 'modelServiceUnavailable',
  networkError = 'modelNetworkError',
  invalidResponse = 'modelInvalidResponse'
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
  },
  {
    statusText: ModelErrEnum.teamModelDisabled,
    message: i18nT('common:code_error.model_error.team_model_disabled'),
    httpStatus: 403
  },
  {
    statusText: ModelErrEnum.embeddingEmptyInput,
    message: i18nT('common:code_error.model_error.embedding_empty_input'),
    httpStatus: 400
  },
  {
    statusText: ModelErrEnum.privateEndpointBlocked,
    message: i18nT('common:code_error.model_error.private_endpoint_blocked'),
    httpStatus: 400
  },
  {
    statusText: ModelErrEnum.authFailed,
    message: i18nT('common:code_error.model_error.auth_failed'),
    httpStatus: 502
  },
  {
    statusText: ModelErrEnum.upstreamQuotaExceeded,
    message: i18nT('common:code_error.model_error.upstream_quota_exceeded'),
    httpStatus: 502
  },
  {
    statusText: ModelErrEnum.permissionDenied,
    message: i18nT('common:code_error.model_error.permission_denied'),
    httpStatus: 502
  },
  {
    statusText: ModelErrEnum.modelNotFound,
    message: i18nT('common:code_error.model_error.model_not_found'),
    httpStatus: 502
  },
  {
    statusText: ModelErrEnum.contentBlocked,
    message: i18nT('common:code_error.model_error.content_blocked'),
    httpStatus: 400
  },
  {
    statusText: ModelErrEnum.inputTooLong,
    message: i18nT('common:code_error.model_error.input_too_long'),
    httpStatus: 400
  },
  {
    statusText: ModelErrEnum.invalidImage,
    message: i18nT('common:code_error.model_error.invalid_image'),
    httpStatus: 400
  },
  {
    statusText: ModelErrEnum.imageDownloadFailed,
    message: i18nT('common:code_error.model_error.image_download_failed'),
    httpStatus: 502
  },
  {
    statusText: ModelErrEnum.invalidRequest,
    message: i18nT('common:code_error.model_error.invalid_request'),
    httpStatus: 400
  },
  {
    statusText: ModelErrEnum.rateLimited,
    message: i18nT('common:code_error.model_error.rate_limited'),
    httpStatus: 429
  },
  {
    statusText: ModelErrEnum.requestTimeout,
    message: i18nT('common:code_error.model_error.request_timeout'),
    httpStatus: 504
  },
  {
    statusText: ModelErrEnum.serviceUnavailable,
    message: i18nT('common:code_error.model_error.service_unavailable'),
    httpStatus: 503
  },
  {
    statusText: ModelErrEnum.networkError,
    message: i18nT('common:code_error.model_error.network_error'),
    httpStatus: 502
  },
  {
    statusText: ModelErrEnum.invalidResponse,
    message: i18nT('common:code_error.model_error.invalid_response'),
    httpStatus: 502
  }
];

/**
 * 脱离 Web i18n 资源容器的后台/独立服务场景（如模型探活告警、单测）使用的英文可读文案兜底，
 * 避免将原始 `common:code_error.model_error.*` 翻译键直接持久化或发送到 Webhook。
 */
export const MODEL_ERROR_FALLBACK_MESSAGES: Readonly<Record<string, string>> = {
  [i18nT('common:model_delisted')]: 'The model has been delisted.',
  [i18nT('common:not_model_config')]: 'Model is not configured.',
  [i18nT('common:code_error.model_error.no_available_channel')]:
    'No available channel to call this model',
  [i18nT('common:code_error.model_error.team_model_disabled')]:
    'The administrator has not enabled the team model feature',
  [i18nT('common:code_error.model_error.embedding_empty_input')]:
    'Embedding input content is empty. Please check the data.',
  [i18nT('common:code_error.model_error.private_endpoint_blocked')]:
    'The model endpoint points to a restricted internal address. Please check the custom model configuration.',
  [i18nT('common:code_error.model_error.auth_failed')]:
    'Model API authentication failed. Please check the API key or channel configuration.',
  [i18nT('common:code_error.model_error.upstream_quota_exceeded')]:
    'Upstream model service quota or balance is insufficient. Please check the model channel account.',
  [i18nT('common:code_error.model_error.permission_denied')]:
    'Permission denied for this model. Please check the model channel or API key permissions.',
  [i18nT('common:code_error.model_error.model_not_found')]:
    'Upstream model or endpoint was not found. Please check the model name and channel configuration.',
  [i18nT('common:code_error.model_error.content_blocked')]:
    'Input content was blocked by the model safety policy. Please modify the content and try again.',
  [i18nT('common:code_error.model_error.input_too_long')]:
    'Input content exceeds the model length limit. Please shorten the content or reduce the chunk size and try again.',
  [i18nT('common:code_error.model_error.invalid_image')]:
    'The image format is unsupported or invalid. Please check the image and try again.',
  [i18nT('common:code_error.model_error.image_download_failed')]:
    'The model failed to download the image. Please check image accessibility or try again later.',
  [i18nT('common:code_error.model_error.invalid_request')]:
    'Model request parameters or input format are not supported. Please check the data content or model configuration.',
  [i18nT('common:code_error.model_error.rate_limited')]:
    'Model requests are being rate-limited. Please try again later.',
  [i18nT('common:code_error.model_error.request_timeout')]:
    'Model service timed out. Please try again later.',
  [i18nT('common:code_error.model_error.service_unavailable')]:
    'Model service is temporarily unavailable. Please try again later.',
  [i18nT('common:code_error.model_error.network_error')]:
    'Failed to connect to the model service. Please check network connectivity or try again later.',
  [i18nT('common:code_error.model_error.invalid_response')]:
    'Model service returned an invalid response. Please try again later or check the model configuration.'
};

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
