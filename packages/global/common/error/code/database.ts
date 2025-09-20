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
  nameError = 'databaseNameError',
  addressError = 'databaseAddressError',
  checkError = 'databaseCheckError',
  connectionFailed = 'databaseConnectionFailed',
  connectionTimeout = 'databaseConnectionTimeout',
  
  // 数据库类型和支持错误
  notSupportType = 'databaseNotSupportType',
  notImplemented = 'databaseNotImplemented',
  
  // API 请求和验证错误
  requestValidationError = 'databaseRequestValidationError',
  invalidTableName = 'databaseInvalidTableName',
  fetchInfoError = 'databaseFetchInfoError',
  invalidConfig = 'databaseInvalidConfig',
  
  // 查询和操作错误
  queryExecutionError = 'databaseQueryExecutionError',
  tableNotFound = 'databaseTableNotFound',
  columnNotFound = 'databaseColumnNotFound',
  syntaxError = 'databaseSyntaxError',
  
  // Schema相关错误
  schemaIntrospectionError = 'databaseSchemaIntrospectionError',
  metadataError = 'databaseMetadataError'
}

const databaseErr = [
  
  {
    statusText: DatabaseErrEnum.datasetParamsError,
    message: 'core.database.error.not_support_dataset_type'
  },
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
    message: 'core.database.error.client_destroy_failed'
  },
  {
    statusText: DatabaseErrEnum.clientAlreadyExists,
    message: 'core.database.error.client_already_exists'
  },
  {
    statusText: DatabaseErrEnum.clientNotFound,
    message: 'core.database.error.client_not_found'
  },
  
  // 连接错误
  {
    statusText: DatabaseErrEnum.authError,
    message: 'core.database.error.auth_failed'
  },
  {
    statusText: DatabaseErrEnum.nameError,
    message: 'core.database.error.database_not_found'
  },
  {
    statusText: DatabaseErrEnum.addressError,
    message: 'core.database.error.connection_address_failed'
  },
  {
    statusText: DatabaseErrEnum.checkError,
    message: 'core.database.error.connection_check_failed'
  },
  {
    statusText: DatabaseErrEnum.connectionFailed,
    message: 'core.database.error.connection_failed'
  },
  {
    statusText: DatabaseErrEnum.connectionTimeout,
    message: 'core.database.error.connection_timeout'
  },
  
  // 类型支持错误
  {
    statusText: DatabaseErrEnum.notSupportType,
    message: 'core.database.error.database_type_not_supported'
  },
  {
    statusText: DatabaseErrEnum.notImplemented,
    message: 'core.database.error.feature_not_implemented'
  },
  
  // 请求验证错误
  {
    statusText: DatabaseErrEnum.requestValidationError,
    message: 'core.database.error.request_validation_failed'
  },
  {
    statusText: DatabaseErrEnum.invalidTableName,
    message: 'core.database.error.invalid_table_name'
  },
  {
    statusText: DatabaseErrEnum.fetchInfoError,
    message: 'core.database.error.fetch_info_failed'
  },
  {
    statusText: DatabaseErrEnum.invalidConfig,
    message: 'core.database.error.invalid_config'
  },
  
  // 查询操作错误
  {
    statusText: DatabaseErrEnum.queryExecutionError,
    message: 'core.database.error.query_execution_failed'
  },
  {
    statusText: DatabaseErrEnum.tableNotFound,
    message: 'core.database.error.table_not_found'
  },
  {
    statusText: DatabaseErrEnum.columnNotFound,
    message: 'core.database.error.column_not_found'
  },
  {
    statusText: DatabaseErrEnum.syntaxError,
    message: 'core.database.error.sql_syntax_error'
  },
  
  // Schema错误
  {
    statusText: DatabaseErrEnum.schemaIntrospectionError,
    message: 'core.database.error.schema_introspection_failed'
  },
  {
    statusText: DatabaseErrEnum.metadataError,
    message: 'core.database.error.metadata_error'
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
