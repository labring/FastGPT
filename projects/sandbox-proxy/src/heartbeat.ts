import { env } from './env';
import { getLogger, LogCategories } from './logger';

const logger = getLogger(LogCategories.MODULE.SANDBOX_PROXY.SERVER);

export const SANDBOX_HEARTBEAT_INTERVAL_MS = 60_000;

type HeartbeatEntry = {
  refs: number;
  timer: ReturnType<typeof setInterval>;
};

const activeHeartbeats = new Map<string, HeartbeatEntry>();

export const postSandboxHeartbeat = async (sandboxId: string): Promise<void> => {
  try {
    const resp = await fetch(`${env.appBaseUrl}/api/core/sandbox/internal/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.secret}`
      },
      body: JSON.stringify({ sandboxId })
    });

    if (!resp.ok) {
      logger.warning(`sandbox heartbeat failed sandboxId=${sandboxId} status=${resp.status}`);
    }
  } catch (e) {
    logger.warning(`sandbox heartbeat error sandboxId=${sandboxId}: ${(e as Error).message}`);
  }
};

export const startSandboxHeartbeat = (
  sandboxId: string,
  intervalMs = SANDBOX_HEARTBEAT_INTERVAL_MS
): (() => void) => {
  const active = activeHeartbeats.get(sandboxId);
  if (active) {
    active.refs += 1;
    logger.info(`sandbox heartbeat attached sandboxId=${sandboxId} refs=${active.refs}`);
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      active.refs -= 1;
      if (active.refs > 0) return;
      clearInterval(active.timer);
      activeHeartbeats.delete(sandboxId);
      logger.info(`sandbox heartbeat stopped sandboxId=${sandboxId}`);
    };
  }

  let stopped = false;
  const timer = setInterval(() => {
    void postSandboxHeartbeat(sandboxId);
  }, intervalMs);
  timer.unref?.();

  activeHeartbeats.set(sandboxId, { refs: 1, timer });
  logger.info(`sandbox heartbeat started sandboxId=${sandboxId} intervalMs=${intervalMs}`);
  void postSandboxHeartbeat(sandboxId);

  return () => {
    if (stopped) return;
    stopped = true;
    const latest = activeHeartbeats.get(sandboxId);
    if (!latest) return;
    latest.refs -= 1;
    if (latest.refs > 0) return;
    clearInterval(timer);
    activeHeartbeats.delete(sandboxId);
    logger.info(`sandbox heartbeat stopped sandboxId=${sandboxId}`);
  };
};
