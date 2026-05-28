import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';

export const WORKFLOW_LOCAL_DRAFT_STORAGE_KEY = 'fastgpt_workflow_local_draft_v1';

const WORKFLOW_LOCAL_DRAFT_VERSION = 1;
const WORKFLOW_LOCAL_DRAFT_EXPIRE_TIME = 7 * 24 * 60 * 60 * 1000;

export type WorkflowLocalDraft = {
  version: typeof WORKFLOW_LOCAL_DRAFT_VERSION;
  appId: string;
  tmbId: string;
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
/** 生成恢复成功后的固定工作流详情页，避免继续复用保存草稿时的 tab/query。 */
export const getWorkflowLocalDraftDetailRoute = (appId: string) => {
  if (!appId || appId.match(/[&=]/)) return '';
  return `/app/detail?appId=${encodeURIComponent(appId)}`;
};

const isWorkflowLocalDraft = (value: any): value is WorkflowLocalDraft => {
  return (
    value?.version === WORKFLOW_LOCAL_DRAFT_VERSION &&
    typeof value.appId === 'string' &&
    typeof value.tmbId === 'string' &&
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

    return parsedDraft;
  } catch (error) {
    removeWorkflowLocalDraft();
    console.warn('[Workflow local draft] Failed to read local draft:', error);
    return null;
  }
};

export const saveWorkflowLocalDraft = ({
  appId,
  tmbId,
  data
}: {
  appId: string;
  tmbId: string;
  data: WorkflowLocalDraft['data'];
}) => {
  removeWorkflowLocalDraftByApp({ appId });

  if (!isBrowser() || !appId || !tmbId || data.nodes.length === 0) {
    return false;
  }

  try {
    const draft: WorkflowLocalDraft = {
      version: WORKFLOW_LOCAL_DRAFT_VERSION,
      appId,
      tmbId,
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
 * 新草稿会保存创建草稿时的 tmbId，登录恢复层需要先校验身份再补远端保存。
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
