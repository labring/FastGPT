import type { Cluster } from 'ioredis';
import type Redis from 'ioredis';
import { isClusterMode } from './config';
import { FASTGPT_REDIS_PREFIX } from './connection';

/**
 * Scan keys from a single Redis node using SCAN command
 * More efficient than KEYS for large datasets
 */
async function scanKeysFromNode(
  node: Redis,
  pattern: string,
  prefixToRemove: string
): Promise<string[]> {
  let cursor = '0';
  const batchSize = 1000;
  const results: string[] = [];

  do {
    const [nextCursor, keys] = await node.scan(cursor, 'MATCH', pattern, 'COUNT', batchSize);
    cursor = nextCursor;

    for (const k of keys) {
      results.push(k.replace(prefixToRemove, ''));
    }
  } while (cursor !== '0');

  return results;
}

/**
 * Get all keys matching a prefix pattern
 * Works in both standalone and cluster modes
 * Both modes use SCAN for better performance
 * Returns keys without the prefix (FASTGPT_REDIS_PREFIX includes hash tag {fastgpt}:)
 */
export async function getAllKeysByPrefix(redis: Redis | Cluster, key: string): Promise<string[]> {
  if (!key) return [];

  const pattern = `${FASTGPT_REDIS_PREFIX}${key}:*`;

  if (isClusterMode()) {
    // In cluster mode, scan all master nodes
    const cluster = redis as Cluster;
    const nodes = cluster.nodes('master');

    const allKeysArrays = await Promise.all(
      nodes.map((node) => scanKeysFromNode(node, pattern, FASTGPT_REDIS_PREFIX))
    );

    // Flatten and deduplicate (keys might overlap during cluster rebalancing)
    return [...new Set(allKeysArrays.flat())];
  } else {
    // Standalone mode - use SCAN on single node
    return scanKeysFromNode(redis as Redis, pattern, FASTGPT_REDIS_PREFIX);
  }
}

/**
 * Wrapper for Redis DEL command
 */
export async function deleteKeys(redis: Redis | Cluster, keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;
  // All keys have {fastgpt} hash tag, so they're in the same slot - no CROSSSLOT error
  return await redis.del(...keys);
}
