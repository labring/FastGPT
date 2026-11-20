import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { WorkflowReferenceSnapshot } from '@fastgpt/global/core/workflow/type/io';

export const WORKFLOW_LOCAL_DRAFT_STORAGE_KEY = 'fastgpt_workflow_local_draft_v1';

const WORKFLOW_LOCAL_DRAFT_VERSION = 1;
const WORKFLOW_LOCAL_DRAFT_EXPIRE_TIME = 7 * 24 * 60 * 60 * 1000;

export type WorkflowLocalDraft = {
  version: typeof WORKFLOW_LOCAL_DRAFT_VERSION;
  appId: string;
  tmbId: string;
  savedAt: number;
  restoreAfterLogin?: boolean;
  data: {
    nodes: StoreNodeItemType[];
    edges: StoreEdgeItemType[];
    chatConfig: AppChatConfigType;
    /** 与保存/发布链路一致：草稿也要带上已删除引用来源的历史展示元数据。 */
    referenceSnapshots?: WorkflowReferenceSnapshot[];
  };
};

type DraftScope = { appId: string; tmbId: string };
const draftKeyPrefix = `${WORKFLOW_LOCAL_DRAFT_STORAGE_KEY}:`;
const getDraftKey = ({ appId, tmbId }: DraftScope) =>
  `${draftKeyPrefix}${JSON.stringify([tmbId, appId])}`;

export type WorkflowLocalDraftCheckResult =
  | {
      status: 'matched';
      draft: WorkflowLocalDraft;
      route: string;
    }
  | {
      status: 'empty' | 'invalid' | 'mismatched-team';
    };

/** 生成恢复成功后的固定工作流详情页，避免继续复用保存草稿时的 tab/query。 */
export const getWorkflowLocalDraftDetailRoute = (appId: string) => {
  if (!appId || appId.match(/[&=]/)) return '';
  return `/app/detail?appId=${encodeURIComponent(appId)}`;
};

const isWorkflowLocalDraft = (value: unknown): value is WorkflowLocalDraft => {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<WorkflowLocalDraft>;
  return (
    draft.version === WORKFLOW_LOCAL_DRAFT_VERSION &&
    typeof draft.appId === 'string' &&
    typeof draft.tmbId === 'string' &&
    typeof draft.savedAt === 'number' &&
    Array.isArray(draft.data?.nodes) &&
    Array.isArray(draft.data?.edges) &&
    !!draft.data?.chatConfig
  );
};

const readStoredDraft = (storage: Storage, key: string): WorkflowLocalDraft | null => {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw);
    if (
      isWorkflowLocalDraft(draft) &&
      Date.now() - draft.savedAt <= WORKFLOW_LOCAL_DRAFT_EXPIRE_TIME
    ) {
      return draft;
    }
  } catch {
    // 无法恢复损坏的草稿。
  }
  storage.removeItem(key);
  return null;
};

/** 仅删除已确认的快照，其他标签页或后续编辑可能已经写入同一应用。 */
export const removeWorkflowLocalDraft = (draft: WorkflowLocalDraft) => {
  if (typeof window === 'undefined') return;
  try {
    const storage = window.localStorage;
    const confirmed = JSON.stringify(draft);
    for (const key of [getDraftKey(draft), WORKFLOW_LOCAL_DRAFT_STORAGE_KEY]) {
      if (JSON.stringify(readStoredDraft(storage, key)) === confirmed) {
        storage.removeItem(key);
      }
    }
  } catch (error) {
    console.warn('[Workflow local draft] Failed to remove local draft:', error);
  }
};

/** 打开编辑器时读当前应用的草稿；登录只自动提交由鉴权失败写入的草稿。 */
export const readWorkflowLocalDraft = (
  filter: { appId?: string; tmbId?: string; requireLoginRestore?: boolean } = {}
): WorkflowLocalDraft | null => {
  if (typeof window === 'undefined') return null;
  try {
    const storage = window.localStorage;
    const { appId, tmbId, requireLoginRestore = !appId } = filter;
    const keys = [WORKFLOW_LOCAL_DRAFT_STORAGE_KEY];
    if (appId && tmbId) {
      keys.unshift(getDraftKey({ appId, tmbId }));
    } else {
      // 读取时也会清理过期草稿，因此先收集 key 再读。
      for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index);
        if (key?.startsWith(draftKeyPrefix)) keys.push(key);
      }
    }
    let newest: WorkflowLocalDraft | null = null;
    for (const key of keys) {
      const draft = readStoredDraft(storage, key);
      if (!draft || (tmbId && draft.tmbId !== tmbId)) continue;
      if (appId && draft.appId !== appId) continue;
      if (requireLoginRestore && draft.restoreAfterLogin === false) continue;
      if (!newest || newest.savedAt < draft.savedAt) newest = draft;
    }
    return newest;
  } catch (error) {
    console.warn('[Workflow local draft] Failed to read local draft:', error);
    return null;
  }
};

export const saveWorkflowLocalDraft = ({
  appId,
  tmbId,
  data,
  restoreAfterLogin = true
}: {
  appId: string;
  tmbId: string;
  data: WorkflowLocalDraft['data'];
  restoreAfterLogin?: boolean;
}) => {
  if (typeof window === 'undefined' || !appId || !tmbId) return;

  try {
    const draft: WorkflowLocalDraft = {
      version: WORKFLOW_LOCAL_DRAFT_VERSION,
      appId,
      tmbId,
      savedAt: Date.now(),
      restoreAfterLogin,
      data
    };

    window.localStorage.setItem(getDraftKey(draft), JSON.stringify(draft));
    const legacy = readStoredDraft(window.localStorage, WORKFLOW_LOCAL_DRAFT_STORAGE_KEY);
    if (legacy?.appId === appId && legacy.tmbId === tmbId) removeWorkflowLocalDraft(legacy);
    return draft;
  } catch (error) {
    console.warn('[Workflow local draft] Failed to save local draft:', error);
  }
};

/**
 * 登录只恢复当前成员的草稿。其他成员的草稿仅用于保护该应用的登录回跳。
 */
export const checkWorkflowLocalDraft = (
  tmbId?: string,
  fallbackAppId?: string
): WorkflowLocalDraftCheckResult => {
  const draft = tmbId ? readWorkflowLocalDraft({ tmbId }) : null;
  if (!draft) {
    const fallbackDraft = fallbackAppId
      ? readWorkflowLocalDraft({ appId: fallbackAppId, requireLoginRestore: true })
      : null;
    return {
      status: fallbackDraft && fallbackDraft.tmbId !== tmbId ? 'mismatched-team' : 'empty'
    };
  }

  const detailRoute = getWorkflowLocalDraftDetailRoute(draft.appId);
  if (!detailRoute) {
    removeWorkflowLocalDraft(draft);
    return { status: 'invalid' };
  }

  return {
    status: 'matched',
    draft,
    route: detailRoute
  };
};
