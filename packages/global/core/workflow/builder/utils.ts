import type { WorkflowBuilderVersion, WorkflowBuilderVersionDisplayState } from './type';

/**
 * 根据版本归档事实和卡片位置推导展示状态。
 */
export const getWorkflowBuilderVersionDisplayState = ({
  version,
  isLatestReady,
  now = Date.now()
}: {
  version: WorkflowBuilderVersion;
  isLatestReady: boolean;
  now?: number;
}): WorkflowBuilderVersionDisplayState => {
  if (version.expiresAt && new Date(version.expiresAt).getTime() <= now) return 'expired';
  if (!version.s3Key) return isLatestReady ? 'ready' : 'superseded';
  return 'available';
};
