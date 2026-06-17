import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type {
  CreatePluginDebugSessionResponseType,
  PluginDebugSessionStatusResponseType
} from '@fastgpt/global/openapi/core/plugin/debug/api';
import { useUserStore } from '@/web/support/user/useUserStore';

export type LocalPluginDebugSession = Pick<
  CreatePluginDebugSessionResponseType,
  'debugSessionId' | 'source' | 'connectUrl' | 'cliCommand' | 'ticketExpiresAt' | 'expiresAt'
> & {
  status?: PluginDebugSessionStatusResponseType['status'];
};

const DebugSessionStoragePrefix = 'fastgpt_plugin_debug_session';
const DebugSessionStorageEvent = 'fastgpt-plugin-debug-session-change';

const getStorageKey = (tmbId: string) => `${DebugSessionStoragePrefix}:${tmbId}`;
const isBrowser = () => typeof window !== 'undefined' && !!window.localStorage;

function emitDebugSessionChange() {
  if (!isBrowser()) return;
  window.dispatchEvent(new Event(DebugSessionStorageEvent));
}

export function getLocalPluginDebugSession(tmbId?: string) {
  if (!tmbId || !isBrowser()) return;

  try {
    const raw = window.localStorage.getItem(getStorageKey(tmbId));
    if (!raw) return;

    const session = JSON.parse(raw) as LocalPluginDebugSession;
    if (!session.debugSessionId || !session.source || Date.now() > session.expiresAt) {
      clearLocalPluginDebugSession(tmbId);
      return;
    }

    return session;
  } catch {
    clearLocalPluginDebugSession(tmbId);
  }
}

export function setLocalPluginDebugSession(tmbId: string, session: LocalPluginDebugSession) {
  if (!isBrowser()) return;
  window.localStorage.setItem(getStorageKey(tmbId), JSON.stringify(session));
  emitDebugSessionChange();
}

export function clearLocalPluginDebugSession(tmbId?: string) {
  if (!tmbId || !isBrowser()) return;
  window.localStorage.removeItem(getStorageKey(tmbId));
  emitDebugSessionChange();
}

export function isUsablePluginDebugSessionStatus(
  status?: PluginDebugSessionStatusResponseType['status']
) {
  return !status || status === 'pending' || status === 'connected';
}

export function useLocalPluginDebugSession() {
  const tmbId = useUserStore((state) => state.userInfo?.team?.tmbId);

  const subscribe = useCallback((onStoreChange: () => void) => {
    if (!isBrowser()) return () => undefined;

    window.addEventListener(DebugSessionStorageEvent, onStoreChange);
    window.addEventListener('storage', onStoreChange);
    return () => {
      window.removeEventListener(DebugSessionStorageEvent, onStoreChange);
      window.removeEventListener('storage', onStoreChange);
    };
  }, []);

  const getSnapshot = useCallback(
    () => JSON.stringify(getLocalPluginDebugSession(tmbId) ?? null),
    [tmbId]
  );

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => 'null');
  const session = useMemo(() => JSON.parse(snapshot) as LocalPluginDebugSession | null, [snapshot]);

  const setSession = useCallback(
    (nextSession: LocalPluginDebugSession) => {
      if (!tmbId) return;
      setLocalPluginDebugSession(tmbId, nextSession);
    },
    [tmbId]
  );

  const clearSession = useCallback(() => clearLocalPluginDebugSession(tmbId), [tmbId]);

  return {
    tmbId,
    session: session && isUsablePluginDebugSessionStatus(session.status) ? session : null,
    setSession,
    clearSession
  };
}
