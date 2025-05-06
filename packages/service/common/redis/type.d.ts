import type Redis from 'ioredis';

declare global {
  var redisCache: Redis | null;
}
