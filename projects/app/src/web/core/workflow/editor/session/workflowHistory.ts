import { formatTime2YMDHMS } from '@fastgpt/global/common/string/time';
import type { WorkflowRuntimePort } from '@fastgpt/global/core/workflow/editor/types';
import type { CanonicalWorkflowData } from '@fastgpt/global/core/workflow/migration/schema';

export type WorkflowVersionEntry = {
  title: string;
  content?: CanonicalWorkflowData;
  contentRevision?: number;
  live?: boolean;
};

const MAX_VERSION_ENTRIES = 101;

/** 新提交清空 redo 分支；云端副本复用同一规则并保留版本标题。 */
export const recordWorkflowVersion = ({
  current,
  versions,
  entry = { title: formatTime2YMDHMS(new Date()) }
}: {
  current: WorkflowRuntimePort;
  versions: readonly WorkflowVersionEntry[];
  entry?: Pick<WorkflowVersionEntry, 'title' | 'content'>;
}): WorkflowVersionEntry[] => {
  const liveIndex = versions.findIndex((entry) => entry.live);
  const initial = versions.at(-1);
  // 撤销到侧边栏上限之外时，所有还显示的版本都属于被截断的 redo 分支。
  const currentBranch = liveIndex >= 0 ? versions.slice(liveIndex, -1) : [];
  const recent = [
    {
      ...entry,
      contentRevision: current.getSavepoint().contentRevision,
      live: true
    },
    ...currentBranch.map((entry) => (entry.live ? { ...entry, live: false } : entry))
  ].slice(0, initial ? MAX_VERSION_ENTRIES - 1 : MAX_VERSION_ENTRIES);
  return initial ? [...recent, { ...initial, live: false }] : recent;
};

/** 按 Runtime 当前 revision 移动 live 标记；回放到列表上限之外时清掉旧标记。 */
export const syncWorkflowLiveVersion = ({
  current,
  versions
}: {
  current: WorkflowRuntimePort;
  versions: readonly WorkflowVersionEntry[];
}): WorkflowVersionEntry[] | undefined => {
  const contentRevision = current.getSavepoint().contentRevision;
  let changed = false;
  const next = versions.map((entry) => {
    const live = entry.contentRevision === contentRevision;
    if ((entry.live ?? false) === live) return entry;
    changed = true;
    return { ...entry, live };
  });
  return changed ? next : undefined;
};
