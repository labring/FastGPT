import type { WorkflowBuilderVersion, WorkflowBuilderVersionDisplayState } from './type';
import appErr, { AppErrEnum } from '../../../common/error/code/app';
import { getErrResponse, UserError } from '../../../common/error/utils';

/** 失败日志只保留受控类别和数字错误码，避免原始异常携带凭证、工作流正文或归档路径。 */
export const getWorkflowBuilderErrorLog = (error: unknown) => {
  const response = getErrResponse(error);
  const code: unknown = response?.code;
  // 服务内部仍抛 UserError(message)，API转换成数字码之前也需保留可检索的业务原因。
  const knownReasons = new Map([
    [AppErrEnum.workflowBuilderVersionExpired, 'version_expired'],
    [AppErrEnum.workflowBuilderVersionNotFound, 'version_not_found'],
    ['Workflow Builder version checksum mismatch', 'checksum_mismatch'],
    ['Workflow Builder version has been superseded', 'version_superseded'],
    ['Workflow Builder version file is invalid', 'version_file_invalid'],
    ['Workflow Builder version has not been archived', 'version_not_archived']
  ]);
  const reason = (() => {
    if (isWorkflowBuilderVersionExpiredError(error)) return 'version_expired';
    if (error instanceof UserError) return knownReasons.get(error.message) ?? 'workflow_error';
    return 'workflow_error';
  })();
  return {
    reason,
    errorType: error instanceof TypeError ? 'TypeError' : 'Error',
    ...(typeof code === 'number' ? { code } : {})
  };
};

/** 识别 API 返回的版本过期业务码，不依赖错误展示文案或 Error 实例。 */
export const isWorkflowBuilderVersionExpiredError = (error: unknown): boolean =>
  getErrResponse(error)?.code === appErr[AppErrEnum.workflowBuilderVersionExpired].code;

/**
 * 根据归档、应用和过期事实推导版本卡片状态。
 */
export const getWorkflowBuilderVersionDisplayState = ({
  version,
  now = Date.now()
}: {
  version: WorkflowBuilderVersion;
  now?: number;
}): WorkflowBuilderVersionDisplayState => {
  if (version.expiresAt && new Date(version.expiresAt).getTime() <= now) return 'expired';
  return version.appliedAt ? 'available' : 'ready';
};
