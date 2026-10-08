import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import type { WorkflowRuntimePort } from '@fastgpt/global/core/workflow/editor/types';
import type { CanonicalWorkflowData } from '@fastgpt/global/core/workflow/migration';

export type WorkflowVersionEntry = {
  title: string;
  content?: CanonicalWorkflowData;
  contentRevision?: number;
  live?: boolean;
};

const MAX_VERSION_ENTRIES = 101;

/** 记录一次成功的 Runtime command；本地版本只保存标题和内容 revision。 */
export const recordWorkflowVersion = ({
  current,
  versions
}: {
  current: WorkflowRuntimePort;
  versions: readonly WorkflowVersionEntry[];
}): WorkflowVersionEntry[] => {
  const liveIndex = versions.findIndex((entry) => entry.live);
  const currentBranch = liveIndex >= 0 ? versions.slice(liveIndex) : versions;
  return [
    {
      title: formatTime2YMDHMS(new Date()),
      contentRevision: current.getSavepoint().contentRevision,
      live: true
    },
    ...currentBranch.map((entry) => (entry.live ? { ...entry, live: false } : entry))
  ].slice(0, MAX_VERSION_ENTRIES);
};

/** 按 Runtime 当前 revision 移动 live 标记；目标 revision 不在列表时保持原数组。 */
export const syncWorkflowLiveVersion = ({
  current,
  versions
}: {
  current: WorkflowRuntimePort;
  versions: readonly WorkflowVersionEntry[];
}): WorkflowVersionEntry[] | undefined => {
  const contentRevision = current.getSavepoint().contentRevision;
  if (!versions.some((entry) => entry.contentRevision === contentRevision)) return undefined;
  return versions.map((entry) => ({
    ...entry,
    live: entry.contentRevision === contentRevision
  }));
};
