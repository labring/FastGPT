import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { UserType } from '@fastgpt/global/support/user/type';

export const WORKFLOW_LOCAL_DRAFT_STORAGE_KEY = 'fastgpt_workflow_local_draft_v1';
export const WORKFLOW_AUTH_INVALID_EVENT = 'fastgpt:workflow-auth-invalid';

const WORKFLOW_LOCAL_DRAFT_VERSION = 1;
const WORKFLOW_LOCAL_DRAFT_EXPIRE_TIME = 7 * 24 * 60 * 60 * 1000;
const WORKFLOW_ROUTE_BASE_URL = 'http://fastgpt.local';

export type WorkflowLocalDraftIdentity = {
  username: string;
  teamId: string;
  tmbId: string;
};

export type WorkflowLocalDraft = WorkflowLocalDraftIdentity & {
  version: typeof WORKFLOW_LOCAL_DRAFT_VERSION;
  appId: string;
  route: string;
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
      status:
        | 'empty'
        | 'expired'
        | 'account-mismatch'
        | 'app-mismatch'
        | 'invalid'
        | 'storage-unavailable';
      draft?: WorkflowLocalDraft;
    };

const isBrowser = () => typeof window !== 'undefined' && !!window.localStorage;

export const getWorkflowLocalDraftIdentity = (
  user: Pick<UserType, 'username' | 'team'> | null | undefined
): WorkflowLocalDraftIdentity | null => {
  if (!user?.username || !user.team?.teamId || !user.team?.tmbId) return null;

  return {
    username: user.username,
    teamId: user.team.teamId,
    tmbId: user.team.tmbId
  };
};

export const getWorkflowLocalDraftRoute = () => {
  if (typeof window === 'undefined') return '';
  return `${window.location.pathname}${window.location.search}`;
};

const getWorkflowRouteCandidates = (route: string) => {
  if (!route) return [];

  const candidates = new Set<string>();
  let currentRoute = route.trim();

  for (let i = 0; i < 3 && currentRoute; i++) {
    if (currentRoute.startsWith('/') && !currentRoute.match(/^\/[\/\\]/)) {
      candidates.add(currentRoute);
    }

    try {
      const decodedRoute = decodeURIComponent(currentRoute);
      if (decodedRoute === currentRoute) break;
      currentRoute = decodedRoute;
    } catch {
      break;
    }
  }

  return Array.from(candidates);
};

export const normalizeWorkflowLocalDraftRoute = (route: string) => {
  return getWorkflowRouteCandidates(route)[0] || '';
};

export const getWorkflowAppIdFromRoute = (route: string) => {
  for (const routeCandidate of getWorkflowRouteCandidates(route)) {
    try {
      const appId =
        new URL(routeCandidate, WORKFLOW_ROUTE_BASE_URL).searchParams.get('appId') || '';
      if (appId && !appId.match(/[&=]/)) return appId;
    } catch {
      continue;
    }
  }

  return '';
};

const isWorkflowLocalDraft = (value: any): value is WorkflowLocalDraft => {
  return (
    value?.version === WORKFLOW_LOCAL_DRAFT_VERSION &&
    typeof value.appId === 'string' &&
    typeof value.route === 'string' &&
    typeof value.username === 'string' &&
    typeof value.teamId === 'string' &&
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

export const removeWorkflowLocalDraftByApp = ({
  appId,
  identity
}: {
  appId: string;
  identity: WorkflowLocalDraftIdentity | null;
}) => {
  const draft = readWorkflowLocalDraft();
  if (!draft || draft.appId !== appId) return;

  if (
    !identity ||
    (draft.username === identity.username &&
      draft.teamId === identity.teamId &&
      draft.tmbId === identity.tmbId)
  ) {
    removeWorkflowLocalDraft();
  }
};

export const readWorkflowLocalDraft = (): WorkflowLocalDraft | null => {
  if (!isBrowser()) return null;

  try {
    const rawDraft = window.localStorage.getItem(WORKFLOW_LOCAL_DRAFT_STORAGE_KEY);
    if (!rawDraft) return null;

    const draft = JSON.parse(rawDraft);
    if (!isWorkflowLocalDraft(draft)) {
      removeWorkflowLocalDraft();
      return null;
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
  route = getWorkflowLocalDraftRoute(),
  identity,
  data
}: {
  appId: string;
  route?: string;
  identity: WorkflowLocalDraftIdentity | null;
  data: WorkflowLocalDraft['data'];
}) => {
  const normalizedRoute = normalizeWorkflowLocalDraftRoute(route);
  removeWorkflowLocalDraftByApp({
    appId,
    identity
  });

  if (!isBrowser() || !appId || !identity || data.nodes.length === 0 || !normalizedRoute) {
    return false;
  }

  try {
    const draft: WorkflowLocalDraft = {
      version: WORKFLOW_LOCAL_DRAFT_VERSION,
      appId,
      route: normalizedRoute,
      ...identity,
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

export const checkWorkflowLocalDraft = ({
  user,
  route
}: {
  user: Pick<UserType, 'username' | 'team'> | null | undefined;
  route?: string;
}): WorkflowLocalDraftCheckResult => {
  if (!isBrowser()) return { status: 'storage-unavailable' };

  const draft = readWorkflowLocalDraft();
  if (!draft) return { status: 'empty' };

  if (Date.now() - draft.savedAt > WORKFLOW_LOCAL_DRAFT_EXPIRE_TIME) {
    removeWorkflowLocalDraft();
    return { status: 'expired' };
  }

  const identity = getWorkflowLocalDraftIdentity(user);
  if (
    !identity ||
    draft.username !== identity.username ||
    draft.teamId !== identity.teamId ||
    draft.tmbId !== identity.tmbId
  ) {
    return { status: 'account-mismatch', draft };
  }

  const draftRoute = normalizeWorkflowLocalDraftRoute(draft.route);
  const draftRouteAppId = getWorkflowAppIdFromRoute(draftRoute);
  if (!draftRouteAppId || draftRouteAppId !== draft.appId) {
    removeWorkflowLocalDraft();
    return { status: 'invalid' };
  }

  const targetRoute = route ? normalizeWorkflowLocalDraftRoute(route) : draftRoute;
  const targetRouteAppId = getWorkflowAppIdFromRoute(targetRoute);
  if (targetRouteAppId && targetRouteAppId !== draft.appId) {
    return { status: 'app-mismatch', draft };
  }

  return {
    status: 'matched',
    draft,
    route: draftRoute
  };
};
