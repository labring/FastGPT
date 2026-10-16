import type { WorkflowBuilderVersion, WorkflowBuilderVersionDisplayState } from './type';
import appErr, { AppErrEnum } from '../../../common/error/code/app';
import { getErrResponse } from '../../../common/error/utils';

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
