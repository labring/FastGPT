import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { EnablePluginDebugChannelResponseType } from '@fastgpt/global/openapi/core/plugin/debug/api';
import { useUserStore } from '@/web/support/user/useUserStore';

export type LocalPluginDebugSession = Pick<
  EnablePluginDebugChannelResponseType,
  | 'source'
  | 'tmbId'
  | 'status'
  | 'enabled'
  | 'keyId'
  | 'connectionKey'
  | 'connectionUrl'
  | 'createdAt'
  | 'updatedAt'
>;

const DebugSessionStoragePrefix = 'fastgpt_plugin_debug_session';
const DebugSessionStorageEvent = 'fastgpt-plugin-debug-session-change';

const getStorageKey = (tmbId: string) => `${DebugSessionStoragePrefix}:${tmbId}`;
const isBrowser = () => typeof window !== 'undefined' && !!window.localStorage;
const isUsablePluginDebugSessionStatus = (status?: LocalPluginDebugSession['status']) =>
  status === 'enabled' || status === 'connected';

function emitDebugSessionChange() {
  if (!isBrowser()) return;
  window.dispatchEvent(new Event(DebugSessionStorageEvent));
}

function normalizeLocalPluginDebugSession(
  value: unknown,
  currentTmbId: string
): LocalPluginDebugSession | undefined {
  if (!value || typeof value !== 'object') return;

  const session = value as Partial<LocalPluginDebugSession>;
  if (
    session.tmbId !== currentTmbId ||
    !session.source ||
    session.enabled !== true ||
    !isUsablePluginDebugSessionStatus(session.status)
  ) {
    return;
  }

  return {
    tmbId: session.tmbId,
    source: session.source,
    status: session.status,
    enabled: true,
    keyId: session.keyId,
    connectionKey: session.connectionKey,
    connectionUrl: session.connectionUrl,
    createdAt: session.createdAt || Date.now(),
    updatedAt: session.updatedAt || Date.now()
  };
}

export function getLocalPluginDebugSession(tmbId?: string) {
  if (!tmbId || !isBrowser()) return;

  try {
    const raw = window.localStorage.getItem(getStorageKey(tmbId));
    if (!raw) return;

    const session = normalizeLocalPluginDebugSession(JSON.parse(raw), tmbId);
    if (!session) {
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
  window.localStorage.setItem(
    getStorageKey(tmbId),
    JSON.stringify({
      tmbId: session.tmbId,
      source: session.source,
      status: session.status,
      enabled: session.enabled,
      keyId: session.keyId,
      connectionKey: session.connectionKey,
      connectionUrl: session.connectionUrl,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    })
  );
  emitDebugSessionChange();
}

export function clearLocalPluginDebugSession(tmbId?: string) {
  if (!tmbId || !isBrowser()) return;
  window.localStorage.removeItem(getStorageKey(tmbId));
  emitDebugSessionChange();
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
    session,
    setSession,
    clearSession
  };
}
