import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';

export const WORKFLOW_LOCAL_DRAFT_STORAGE_KEY = 'fastgpt_workflow_local_draft_v1';
const WORKFLOW_LOCAL_DRAFT_NOTICE_KEY = 'fastgpt_workflow_local_draft_notice_v1';

const WORKFLOW_LOCAL_DRAFT_VERSION = 1;
const WORKFLOW_LOCAL_DRAFT_EXPIRE_TIME = 7 * 24 * 60 * 60 * 1000;

export type WorkflowLocalDraft = {
  version: typeof WORKFLOW_LOCAL_DRAFT_VERSION;
  appId: string;
  savedAt: number;
  data: {
    nodes: StoreNodeItemType[];
    edges: StoreEdgeItemType[];
    chatConfig: AppChatConfigType;
  };
};

export type WorkflowLocalDraftCheckResult =
  | {
      status: 'matched';
      draft: WorkflowLocalDraft;
      route: string;
    }
  | {
      status: 'empty' | 'expired' | 'invalid' | 'storage-unavailable';
      draft?: WorkflowLocalDraft;
    };

const isBrowser = () => typeof window !== 'undefined' && !!window.localStorage;
const isSessionStorageAvailable = () => typeof window !== 'undefined' && !!window.sessionStorage;

/** 生成恢复成功后的固定工作流详情页，避免继续复用保存草稿时的 tab/query。 */
export const getWorkflowLocalDraftDetailRoute = (appId: string) => {
  if (!appId || appId.match(/[&=]/)) return '';
  return `/app/detail?appId=${encodeURIComponent(appId)}`;
};

const isWorkflowLocalDraft = (value: any): value is WorkflowLocalDraft => {
  return (
    value?.version === WORKFLOW_LOCAL_DRAFT_VERSION &&
    typeof value.appId === 'string' &&
    typeof value.savedAt === 'number' &&
    Array.isArray(value.data?.nodes) &&
    Array.isArray(value.data?.edges) &&
    !!value.data?.chatConfig
  );
};

export const removeWorkflowLocalDraft = () => {
  if (!isBrowser()) return;

  try {
    window.localStorage.removeItem(WORKFLOW_LOCAL_DRAFT_STORAGE_KEY);
  } catch (error) {
    console.warn('[Workflow local draft] Failed to remove local draft:', error);
  }
};

export const markWorkflowLocalDraftSavedNotice = () => {
  if (!isSessionStorageAvailable()) return;

  try {
    window.sessionStorage.setItem(WORKFLOW_LOCAL_DRAFT_NOTICE_KEY, '1');
  } catch (error) {
    console.warn('[Workflow local draft] Failed to mark local draft notice:', error);
  }
};

export const consumeWorkflowLocalDraftSavedNotice = () => {
  if (!isSessionStorageAvailable()) return false;

  try {
    const notice = window.sessionStorage.getItem(WORKFLOW_LOCAL_DRAFT_NOTICE_KEY);
    window.sessionStorage.removeItem(WORKFLOW_LOCAL_DRAFT_NOTICE_KEY);
    return notice === '1';
  } catch (error) {
    console.warn('[Workflow local draft] Failed to consume local draft notice:', error);
    return false;
  }
};

export const removeWorkflowLocalDraftByApp = ({ appId }: { appId: string }) => {
  const draft = readWorkflowLocalDraft();
  if (!draft || draft.appId !== appId) return;

  removeWorkflowLocalDraft();
};

export const readWorkflowLocalDraft = (): WorkflowLocalDraft | null => {
  if (!isBrowser()) return null;

  try {
    const rawDraft = window.localStorage.getItem(WORKFLOW_LOCAL_DRAFT_STORAGE_KEY);
    if (!rawDraft) return null;

    const parsedDraft = JSON.parse(rawDraft);
    if (!isWorkflowLocalDraft(parsedDraft)) {
      removeWorkflowLocalDraft();
      return null;
    }

    const {
      username: _legacyUsername,
      teamId: _legacyTeamId,
      tmbId: _legacyTmbId,
      route: _legacyRoute,
      ...draft
    } = parsedDraft as WorkflowLocalDraft & {
      username?: string;
      teamId?: string;
      tmbId?: string;
      route?: string;
    };
    if (_legacyUsername || _legacyTeamId || _legacyTmbId || _legacyRoute) {
      window.localStorage.setItem(WORKFLOW_LOCAL_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    }

    return draft;
  } catch (error) {
    removeWorkflowLocalDraft();
    console.warn('[Workflow local draft] Failed to read local draft:', error);
    return null;
  }
};

export const saveWorkflowLocalDraft = ({
  appId,
  data
}: {
  appId: string;
  data: WorkflowLocalDraft['data'];
}) => {
  removeWorkflowLocalDraftByApp({ appId });

  if (!isBrowser() || !appId || data.nodes.length === 0) {
    return false;
  }

  try {
    const draft: WorkflowLocalDraft = {
      version: WORKFLOW_LOCAL_DRAFT_VERSION,
      appId,
      savedAt: Date.now(),
      data
    };

    window.localStorage.setItem(WORKFLOW_LOCAL_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    return true;
  } catch (error) {
    console.warn('[Workflow local draft] Failed to save local draft:', error);
    return false;
  }
};

/**
 * 登录恢复草稿的最小匹配规则：本地存在未过期草稿即可恢复。
 * tmbId 一致性由登录恢复层通过全局最近登录身份判断，草稿本身不保存账号身份。
 * 恢复成功后强制跳到草稿所属 app 的详情页，不再要求登录回跳路由也指向该 app。
 */
export const checkWorkflowLocalDraft = (): WorkflowLocalDraftCheckResult => {
  if (!isBrowser()) return { status: 'storage-unavailable' };

  const draft = readWorkflowLocalDraft();
  if (!draft) return { status: 'empty' };

  if (Date.now() - draft.savedAt > WORKFLOW_LOCAL_DRAFT_EXPIRE_TIME) {
    removeWorkflowLocalDraft();
    return { status: 'expired' };
  }

  const detailRoute = getWorkflowLocalDraftDetailRoute(draft.appId);
  if (!detailRoute) {
    removeWorkflowLocalDraft();
    return { status: 'invalid' };
  }

  return {
    status: 'matched',
    draft,
    route: detailRoute
  };
};
