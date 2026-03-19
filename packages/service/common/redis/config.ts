import type { RedisOptions, ClusterOptions, ClusterNode } from 'ioredis';

export type RedisMode = 'standalone' | 'cluster';

export type RedisConfig = {
  mode: RedisMode;
  standalone?: {
    url: string;
    options?: RedisOptions;
  };
  cluster?: {
    nodes: ClusterNode[];
    options?: ClusterOptions;
  };
};

// Cache the parsed configuration to avoid repeated environment variable parsing
let cachedRedisConfig: RedisConfig | null = null;

/**
 * Parse Redis configuration from environment variables
 * Auto-detects cluster vs standalone mode
 * Result is cached after first call
 */
export function parseRedisConfig(): RedisConfig {
  // Return cached config if available
  if (cachedRedisConfig) {
    return cachedRedisConfig;
  }
  const clusterNodes = process.env.REDIS_CLUSTER_NODES?.trim();

  // Cluster mode detection - only if REDIS_CLUSTER_NODES is set and not empty
  if (clusterNodes && clusterNodes.length > 0) {
    const nodes = clusterNodes.split(',').map((node) => {
      const [host, port] = node.trim().split(':');
      return { host, port: parseInt(port) || 6379 };
    });

    // Validate that we have at least one valid node
    const validNodes = nodes.filter((node) => node.host && node.host.length > 0);
    if (validNodes.length === 0) {
      console.warn(
        'REDIS_CLUSTER_NODES is set but contains no valid nodes. Falling back to standalone mode.'
      );
      // Fall through to standalone mode
    } else {
      const password = process.env.REDIS_PASSWORD;

      // Parse optional JSON configuration
      let additionalOptions: Partial<ClusterOptions> = {};
      if (process.env.REDIS_CLUSTER_OPTIONS) {
        try {
          additionalOptions = JSON.parse(process.env.REDIS_CLUSTER_OPTIONS);
        } catch (error) {
          console.warn('Invalid REDIS_CLUSTER_OPTIONS JSON, using defaults');
        }
      }

      console.log(
        `Redis cluster mode detected with ${validNodes.length} node(s): ${validNodes.map((n) => `${n.host}:${n.port}`).join(', ')}`
      );

      cachedRedisConfig = {
        mode: 'cluster',
        cluster: {
          nodes: validNodes,
          options: {
            redisOptions: {
              password
            },
            slotsRefreshTimeout: 10000, // Increase timeout for slot refresh
            ...additionalOptions
          }
        }
      };

      return cachedRedisConfig;
    }
  }

  // Standalone mode (default/current behavior)
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

  console.log(`Redis standalone mode detected. URL: ${redisUrl.replace(/:[^:@]+@/, ':****@')}`);

  cachedRedisConfig = {
    mode: 'standalone',
    standalone: {
      url: redisUrl,
      options: {}
    }
  };

  return cachedRedisConfig;
}

/**
 * Check if Redis is configured in cluster mode
 */
export function isClusterMode(): boolean {
  return parseRedisConfig().mode === 'cluster';
}
