import { configureRedisRuntime } from '@fastgpt/dal/redis/runtime';

if (!process.env.REDIS_INTEGRATION_URL)
  throw new Error('Session tests require the dedicated remote Redis DB');
if (!process.env.SESSION_TEST_MONGODB_URI)
  throw new Error('Session tests require a dedicated remote Mongo test database');
configureRedisRuntime({ redisUrl: process.env.REDIS_INTEGRATION_URL });
