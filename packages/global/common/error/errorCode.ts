import appErr from './code/app';
import chatErr from './code/chat';
import datasetErr from './code/dataset';
import openapiErr from './code/openapi';
import pluginErr from './code/plugin';
import outLinkErr from './code/outLink';
import teamErr from './code/team';
import userErr from './code/user';
import commonErr from './code/common';
import s3Err from './code/s3';
import SystemErrEnum from './code/system';
import agentSkillErr from './code/agentSkill';
import { i18nT } from '../../../web/i18n/utils';

export const ERROR_CODE: { [key: number]: string } = {
  400: i18nT('common:code_error.error_code.400'),
  401: i18nT('common:code_error.error_code.401'),
  403: i18nT('common:code_error.error_code.403'),
  404: i18nT('common:code_error.error_code.404'),
  405: i18nT('common:code_error.error_code.405'),
  406: i18nT('common:code_error.error_code.406'),
  410: i18nT('common:code_error.error_code.410'),
  422: i18nT('common:code_error.error_code.422'),
  429: i18nT('common:code_error.error_code.429'),
  500: i18nT('common:code_error.error_code.500'),
  502: i18nT('common:code_error.error_code.502'),
  503: i18nT('common:code_error.error_code.503'),
  504: i18nT('common:code_error.error_code.504')
};

export const TOKEN_ERROR_CODE: Record<number, string> = {
  403: i18nT('common:code_error.token_error_code.403')
};

export const proxyError: Record<string, boolean> = {
  ECONNABORTED: true,
  ECONNRESET: true
};

export enum ERROR_ENUM {
  unAuthorization = 'unAuthorization',
  insufficientQuota = 'insufficientQuota',
  unAuthModel = 'unAuthModel',
  unAuthApiKey = 'unAuthApiKey',
  unAuthFile = 'unAuthFile',
  tooManyRequest = 'tooManyRequest',
  /** 对话/知识库等上传：短时请求次数超过套餐或系统频率限制 */
  uploadFileIntervalLimit = 'uploadFileIntervalLimit'
}

export type ErrType<T> = Record<
  string,
  {
    code: number;
    statusText: T;
    message: string;
    data: null;
  }
>;

export const ERROR_RESPONSE: Record<
  any,
  {
    code: number;
    statusText: string;
    message: string;
    data?: any;
  }
> = {
  [ERROR_ENUM.unAuthorization]: {
    code: 403,
    statusText: ERROR_ENUM.unAuthorization,
    message: i18nT('common:code_error.error_message.403'),
    data: null
  },
  [ERROR_ENUM.tooManyRequest]: {
    code: 429,
    statusText: ERROR_ENUM.tooManyRequest,
    message: i18nT('common:error.too_many_request'),
    data: null
  },
  [ERROR_ENUM.uploadFileIntervalLimit]: {
    code: 429,
    statusText: ERROR_ENUM.uploadFileIntervalLimit,
    message: i18nT('common:error.upload_file_interval_limit'),
    data: null
  },
  [ERROR_ENUM.insufficientQuota]: {
    code: 510,
    statusText: ERROR_ENUM.insufficientQuota,
    message: i18nT('common:code_error.error_message.510'),
    data: null
  },
  [ERROR_ENUM.unAuthModel]: {
    code: 511,
    statusText: ERROR_ENUM.unAuthModel,
    message: i18nT('common:code_error.error_message.511'),
    data: null
  },
  [ERROR_ENUM.unAuthFile]: {
    code: 513,
    statusText: ERROR_ENUM.unAuthFile,
    message: i18nT('common:code_error.error_message.513'),
    data: null
  },
  [ERROR_ENUM.unAuthApiKey]: {
    code: 514,
    statusText: ERROR_ENUM.unAuthApiKey,
    message: i18nT('common:code_error.error_message.514'),
    data: null
  },
  ...appErr,
  ...chatErr,
  ...datasetErr,
  ...openapiErr,
  ...outLinkErr,
  ...teamErr,
  ...userErr,
  ...pluginErr,
  ...commonErr,
  ...s3Err,
  ...SystemErrEnum,
  ...agentSkillErr
};
