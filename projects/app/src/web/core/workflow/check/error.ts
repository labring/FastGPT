import { WorkflowCheckIssueCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { PluginErrEnum } from '@fastgpt/global/common/error/code/plugin';
import { ERROR_RESPONSE } from '@fastgpt/global/common/error/errorCode';
import { isToolNotExistError } from '@fastgpt/global/core/app/utils';

const PLUGIN_DATA_PERMISSION_ERROR_CODES = new Set<string>([
  AppErrEnum.unAuthApp,
  PluginErrEnum.unAuth
]);

const PLUGIN_DATA_MISSING_ERROR_CODES = new Set<string>([
  AppErrEnum.unExist,
  PluginErrEnum.unExist
]);

/** pluginData.error 可能是 statusText 或 getErrText 翻译后的 message，需两种都识别。 */
export const resolvePluginDataErrorIssueCode = (
  error: string
):
  | WorkflowCheckIssueCodeEnum.resourceNoPermission
  | WorkflowCheckIssueCodeEnum.toolMissing
  | WorkflowCheckIssueCodeEnum.toolLoadFailed => {
  if (
    error === WorkflowCheckIssueCodeEnum.resourceNoPermission ||
    PLUGIN_DATA_PERMISSION_ERROR_CODES.has(error) ||
    error === ERROR_RESPONSE[AppErrEnum.unAuthApp]?.message ||
    error === ERROR_RESPONSE[PluginErrEnum.unAuth]?.message
  ) {
    return WorkflowCheckIssueCodeEnum.resourceNoPermission;
  }

  if (
    error === WorkflowCheckIssueCodeEnum.toolMissing ||
    error === WorkflowCheckIssueCodeEnum.resourceMissing ||
    PLUGIN_DATA_MISSING_ERROR_CODES.has(error) ||
    error === ERROR_RESPONSE[AppErrEnum.unExist]?.message ||
    error === ERROR_RESPONSE[PluginErrEnum.unExist]?.message ||
    isToolNotExistError(error)
  ) {
    return WorkflowCheckIssueCodeEnum.toolMissing;
  }

  return WorkflowCheckIssueCodeEnum.toolLoadFailed;
};
