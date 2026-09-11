import { i18nT } from '../../../common/i18n/utils';

export const userImportErrorKeys = {
  USER_IMPORT_TEAM_MODE_LOCKED: i18nT('account_team:user_import_USER_IMPORT_TEAM_MODE_LOCKED'),
  USERNAME_REQUIRED: i18nT('account_team:user_import_USERNAME_REQUIRED'),
  USERNAME_TOO_LONG: i18nT('account_team:user_import_USERNAME_TOO_LONG'),
  USERNAME_RESERVED: i18nT('account_team:user_import_USERNAME_RESERVED'),
  USERNAME_DUPLICATED_IN_FILE: i18nT('account_team:user_import_USERNAME_DUPLICATED_IN_FILE'),
  USERNAME_ALREADY_EXISTS: i18nT('account_team:user_import_USERNAME_ALREADY_EXISTS'),
  PASSWORD_REQUIRED: i18nT('account_team:user_import_PASSWORD_REQUIRED'),
  PASSWORD_INVALID: i18nT('account_team:user_import_PASSWORD_INVALID'),
  NICKNAME_TOO_LONG: i18nT('account_team:user_import_NICKNAME_TOO_LONG'),
  DEPARTMENT_PATH_INVALID: i18nT('account_team:user_import_DEPARTMENT_PATH_INVALID'),
  DEPARTMENT_AMBIGUOUS: i18nT('account_team:user_import_DEPARTMENT_AMBIGUOUS'),
  CELL_TYPE_INVALID: i18nT('account_team:user_import_CELL_TYPE_INVALID'),
  USERNAME_CONFLICT_DURING_IMPORT: i18nT(
    'account_team:user_import_USERNAME_CONFLICT_DURING_IMPORT'
  ),
  CHUNK_WRITE_FAILED: i18nT('account_team:user_import_CHUNK_WRITE_FAILED'),
  USER_IMPORT_NOT_ALLOWED_IN_SYNC_MODE: i18nT(
    'account_team:user_import_USER_IMPORT_NOT_ALLOWED_IN_SYNC_MODE'
  ),
  USER_IMPORT_ALREADY_RUNNING: i18nT('account_team:user_import_USER_IMPORT_ALREADY_RUNNING'),
  IMPORT_ERROR_FILE_NOT_FOUND: i18nT('account_team:user_import_IMPORT_ERROR_FILE_NOT_FOUND'),
  USER_IMPORT_INVALID_XLSX: i18nT('account_team:user_import_USER_IMPORT_INVALID_XLSX'),
  USER_IMPORT_ONLY_XLSX: i18nT('account_team:user_import_USER_IMPORT_ONLY_XLSX'),
  IMPORT_TASK_FAILED: i18nT('account_team:user_import_IMPORT_TASK_FAILED'),
  LICENSE_NOT_ACTIVE: i18nT('account_team:user_import_LICENSE_NOT_ACTIVE'),
  LICENSE_USER_LIMIT: i18nT('account_team:user_import_LICENSE_USER_LIMIT'),
  TEAM_MODE_CHANGED: i18nT('account_team:user_import_TEAM_MODE_CHANGED'),
  TEAM_ROOT_ORG_INVALID: i18nT('account_team:user_import_TEAM_ROOT_ORG_INVALID'),
  USER_IMPORT_MISSING_USERNAME: i18nT('account_team:user_import_USER_IMPORT_MISSING_USERNAME'),
  USER_IMPORT_MISSING_PASSWORD: i18nT('account_team:user_import_USER_IMPORT_MISSING_PASSWORD'),
  USER_IMPORT_DUPLICATE_COLUMN: i18nT('account_team:user_import_USER_IMPORT_DUPLICATE_COLUMN'),
  USER_IMPORT_EMPTY: i18nT('account_team:user_import_USER_IMPORT_EMPTY'),
  USER_IMPORT_TOO_MANY_ROWS: i18nT('account_team:user_import_USER_IMPORT_TOO_MANY_ROWS'),
  USER_IMPORT_TOO_MANY_COLUMNS: i18nT('account_team:user_import_USER_IMPORT_TOO_MANY_COLUMNS'),
  USER_IMPORT_WORKSHEET_COUNT: i18nT('account_team:user_import_USER_IMPORT_WORKSHEET_COUNT'),
  USER_IMPORT_MERGED_CELLS: i18nT('account_team:user_import_USER_IMPORT_MERGED_CELLS'),
  USER_IMPORT_CELL_TYPE: i18nT('account_team:user_import_USER_IMPORT_CELL_TYPE')
} as const;
