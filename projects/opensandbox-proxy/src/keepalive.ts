import type { AppAuthClient } from './auth';

export type KeepaliveTracker = {
  acquire: (sandboxId: string) => () => void;
  touch: (sandboxId: string) => void;
  flush: () => Promise<void>;
  stop: () => void;
};

/**
 * 沙盒活跃续期聚合器：
 * - 对有状态长连接终端 WebSocket 采用引用计数（`acquire` / 幂等释放函数），只要任一终端连接存活即每周期自动续期；
 * - 对无状态 HTTP 预览请求采用单次脏标记（`touch`），在下一轮周期合并去重上报后立即清空，防止用户关闭预览标签页后沙盒被永久保活；
 * - 通过 `flushing` 重入锁避免主站响应慢于周期间隔时产生并发堆积请求。
 */
export function createKeepaliveTracker(params: {
  authClient: Pick<AppAuthClient, 'sendKeepalive'>;
  intervalMs: number;
  onError?: (error: unknown) => void;
}): KeepaliveTracker {
  const { authClient, intervalMs, onError } = params;
  const activeCounts = new Map<string, number>();
  const touchedOnce = new Set<string>();
  let flushing = false;

  const flush = async (): Promise<void> => {
    if (flushing) {
      return;
    }

    // 1. 合并当前长连接活跃沙盒与本周期发生过预览访问的沙盒，并立即清空一次性集合。
    const batch = new Set<string>(activeCounts.keys());
    for (const id of touchedOnce) {
      batch.add(id);
    }
    touchedOnce.clear();

    if (batch.size === 0) {
      return;
    }

    // 2. 批量向主站上报活跃续期。
    flushing = true;
    try {
      await authClient.sendKeepalive(Array.from(batch));
    } catch (error) {
      onError?.(error);
    } finally {
      flushing = false;
    }
  };

  const timer = setInterval(() => {
    void flush();
  }, intervalMs);
  timer.unref?.();

  return {
    acquire: (sandboxId: string) => {
      const normalized = sandboxId.trim();
      if (normalized === '') {
        return () => {};
      }
      activeCounts.set(normalized, (activeCounts.get(normalized) ?? 0) + 1);
      let released = false;
      return () => {
        if (released) {
          return;
        }
        released = true;
        const current = activeCounts.get(normalized) ?? 0;
        if (current <= 1) {
          activeCounts.delete(normalized);
        } else {
          activeCounts.set(normalized, current - 1);
        }
      };
    },

    touch: (sandboxId: string) => {
      const normalized = sandboxId.trim();
      if (normalized !== '') {
        touchedOnce.add(normalized);
      }
    },

    flush,

    stop: () => {
      clearInterval(timer);
      activeCounts.clear();
      touchedOnce.clear();
    }
  };
}
