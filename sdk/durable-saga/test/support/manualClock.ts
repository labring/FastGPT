import type { SagaClock } from '../../src/runtime/ports';

type Sleeper = {
  at: number;
  resolve(): void;
  reject(reason?: unknown): void;
  signal?: AbortSignal;
};

export type ManualSagaClock = SagaClock & {
  advanceBy(ms: number): Promise<void>;
  advanceTo(date: Date): Promise<void>;
  pendingSleeps(): number;
};

/** Deterministic clock for retry, timeout and heartbeat tests; it never uses a real timer. */
export const createManualSagaClock = (initial: Date): ManualSagaClock => {
  let nowMs = initial.getTime();
  const sleepers = new Set<Sleeper>();

  const flush = async () => {
    const due = [...sleepers].filter((sleeper) => sleeper.at <= nowMs);
    for (const sleeper of due) {
      sleepers.delete(sleeper);
      sleeper.resolve();
    }
    await Promise.resolve();
  };

  const clock: ManualSagaClock = {
    now: () => new Date(nowMs),
    sleep(ms, signal) {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(signal.reason);
          return;
        }
        const sleeper: Sleeper = { at: nowMs + ms, resolve, reject, signal };
        sleepers.add(sleeper);
        signal?.addEventListener(
          'abort',
          () => {
            if (sleepers.delete(sleeper)) reject(signal.reason);
          },
          { once: true }
        );
      });
    },
    async advanceBy(ms) {
      if (ms < 0) throw new Error('Manual clock cannot move backwards');
      nowMs += ms;
      await flush();
    },
    async advanceTo(date) {
      if (date.getTime() < nowMs) throw new Error('Manual clock cannot move backwards');
      nowMs = date.getTime();
      await flush();
    },
    pendingSleeps: () => sleepers.size
  };
  return clock;
};
