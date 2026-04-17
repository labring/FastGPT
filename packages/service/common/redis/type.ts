import type Redis from 'ioredis';
import type { Cluster } from 'ioredis';

declare global {
  var redisClient: Redis | Cluster | null;
}
