import { WorkflowCheckIssueCodeEnum } from '@fastgpt/global/core/workflow/diagnostic/constants';
import { getWorkflowPluginDataIssue } from '@fastgpt/global/common/workflow/resourceRules';

/** pluginData.error 可能是 statusText 或 getErrText 翻译后的 message，需两种都识别。 */
export const resolvePluginDataErrorIssueCode = (
  error: string
):
  | WorkflowCheckIssueCodeEnum.resourceNoPermission
  | WorkflowCheckIssueCodeEnum.toolMissing
  | WorkflowCheckIssueCodeEnum.toolLoadFailed => {
  const issue = getWorkflowPluginDataIssue(error);
  if (issue === 'no_permission') return WorkflowCheckIssueCodeEnum.resourceNoPermission;
  if (issue === 'missing') return WorkflowCheckIssueCodeEnum.toolMissing;
  return WorkflowCheckIssueCodeEnum.toolLoadFailed;
};
