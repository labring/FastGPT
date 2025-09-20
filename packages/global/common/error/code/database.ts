import { i18nT } from '../../../../web/i18n/utils';
import { type ErrType } from '../errorCode';

/* database: 509000 */
export enum DatabaseErrEnum {
  // 知识库相关
  datasetParamsError = 'datasetParamsError',
  // 客户端创建和管理错误
  clientCreateError = 'databaseClientCreateError',
  clientUpdateError = 'databaseClientUpdateError',
  clientDestroyError = 'databaseClientDestroyError',
  clientAlreadyExists = 'databaseClientAlreadyExists',
  clientNotFound = 'databaseClientNotFound',

  // 连接相关错误
  authError = 'databaseAuthError',
  databaseNameError = 'databaseNameError',
  databasePortError = 'databasePortError',
  hostError = 'databaseHostError',
  checkError = 'databaseCheckError',
  econnRefused = 'connectionRefused',
  connectionFailed = 'databaseConnectionFailed',
  connectionTimeout = 'databaseConnectionTimeout',
  connectionLost = 'databaseConnectionLost',

  // 数据库类型和支持错误
  notSupportType = 'databaseNotSupportType',
  notImplemented = 'databaseNotImplemented',

  // API 请求和验证错误
  requestValidationError = 'databaseRequestValidationError',
  invalidTableName = 'databaseInvalidTableName',
  fetchInfoError = 'databaseFetchInfoError',
  dbConfigNotFound = 'databaseConfigNotFound',
  opUnknownDatabaseError = 'opUnknownDatabaseError',
  dativeServiceError = 'dativeServiceError'
}

const databaseErr = [
  // 客户端管理错误
  {
    statusText: DatabaseErrEnum.clientCreateError,
    message: 'core.database.error.client_create_failed'
  },
  {
    statusText: DatabaseErrEnum.clientUpdateError,
    message: 'core.database.error.client_update_failed'
  },
  {
    statusText: DatabaseErrEnum.clientDestroyError,
    message: i18nT('database_client:client_destory_error')
  },
  {
    statusText: DatabaseErrEnum.clientNotFound,
    message: i18nT('database_client:client_not_found')
  },

  // 连接错误
  {
    statusText: DatabaseErrEnum.authError,
    message: i18nT('database_client:authentication_failed')
  },
  {
    statusText: DatabaseErrEnum.databaseNameError,
    message: i18nT('database_client:database_not_exist')
  },
  {
    statusText: DatabaseErrEnum.databasePortError,
    message: i18nT('database_client:database_port_error')
  },
  {
    statusText: DatabaseErrEnum.hostError,
    message: i18nT('database_client:host_error')
  },
  {
    statusText: DatabaseErrEnum.econnRefused,
    message: i18nT('database_client:connection_refused')
  },
  {
    statusText: DatabaseErrEnum.checkError,
    message: i18nT('database_client:connection_check_error')
  },
  {
    statusText: DatabaseErrEnum.connectionLost,
    message: i18nT('database_client:connection_lost')
  },
  {
    statusText: DatabaseErrEnum.connectionFailed,
    message: i18nT('database_client:connection_failed')
  },
  {
    statusText: DatabaseErrEnum.connectionTimeout,
    message: i18nT('database_client:connection_timeout')
  },

  // 类型支持错误
  {
    statusText: DatabaseErrEnum.notSupportType,
    message: i18nT('database_client:not_support_databaseType')
  },
  {
    statusText: DatabaseErrEnum.notImplemented,
    message: i18nT('database_client:not_implemented_databaseType')
  },

  // 请求验证错误
  {
    statusText: DatabaseErrEnum.invalidTableName,
    message: i18nT('database_client:invalid_table_name')
  },
  {
    statusText: DatabaseErrEnum.fetchInfoError,
    message: i18nT('database_client:fetch_info_error')
  },
  {
    statusText: DatabaseErrEnum.dbConfigNotFound,
    message: i18nT('database_client:database_config_not_found')
  },
  {
    statusText: DatabaseErrEnum.opUnknownDatabaseError,
    message: i18nT('database_client:op_unknown_database_error')
  },
  {
    statusText: DatabaseErrEnum.dativeServiceError,
    message: i18nT('database_client:dative_service_error')
  }
];

export default databaseErr.reduce((acc, cur, index) => {
  return {
    ...acc,
    [cur.statusText]: {
      code: 509000 + index,
      statusText: cur.statusText,
      message: cur.message,
      data: null
    }
  };
}, {} as ErrType<`${DatabaseErrEnum}`>);
