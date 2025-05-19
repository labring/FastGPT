import Redis from 'ioredis';

declare global {
  var redisCache: Redis | null;
}
