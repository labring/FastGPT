import type { LeaseProvider } from '@fastgpt-sdk/durable-saga';
import { withRedisLease, type RedisLeaseContext } from '../redis/lock';

type RedisSagaLeaseOptions = {
  ttlMs: number;
  renewIntervalMs?: number;
  label?: string;
  mapKey?: (reservationKey: string) => string;
  runWithLease?: typeof withRedisLease;
};

/**
 * Adapts existing token-checked Redis leases to the Saga multi-key port. Keys are deduplicated and
 * sorted before nested acquisition, which gives every contender the same lock order.
 */
export const createRedisSagaLeaseProvider = (options: RedisSagaLeaseOptions): LeaseProvider => {
  const runWithLease = options.runWithLease ?? withRedisLease;
  const mapKey = options.mapKey ?? ((key: string) => key);

  return {
    async withLeases(keys, run) {
      const sortedKeys = [...new Set(keys.map(mapKey))].sort();
      const contexts: RedisLeaseContext[] = [];
      const abortController = new AbortController();

      const acquire = async (index: number): Promise<ReturnType<typeof run>> => {
        const key = sortedKeys[index];
        if (!key) {
          return run({
            signal: abortController.signal,
            assertValid: async () => {
              for (const context of contexts) context.assertValid();
            }
          });
        }

        return runWithLease({
          key,
          label: options.label ?? 'durable-saga',
          ttlMs: options.ttlMs,
          renewIntervalMs: options.renewIntervalMs,
          fn: async (context) => {
            contexts.push(context);
            const abort = () => {
              if (!abortController.signal.aborted) {
                abortController.abort(context.signal.reason);
              }
            };
            if (context.signal.aborted) abort();
            else context.signal.addEventListener('abort', abort, { once: true });
            try {
              return await acquire(index + 1);
            } finally {
              contexts.pop();
            }
          }
        });
      };

      return acquire(0);
    }
  };
};
