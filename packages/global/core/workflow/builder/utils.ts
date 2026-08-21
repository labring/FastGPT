import type { WorkflowBuilderVersion, WorkflowBuilderVersionDisplayState } from './type';

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
