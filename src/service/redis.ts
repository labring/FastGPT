import { createClient } from 'redis';
import { customAlphabet } from 'nanoid';
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 10);

export const connectRedis = async () => {
  // 断开了，重连
  if (global.redisClient && !global.redisClient.isOpen) {
    await global.redisClient.disconnect();
  } else if (global.redisClient) {
    // 没断开，不再连接
    return global.redisClient;
  }

  try {
    global.redisClient = createClient({
      url: process.env.REDIS_URL
    });

    global.redisClient.on('error', (err) => {
      console.log('Redis Client Error', err);
      global.redisClient = null;
    });
    global.redisClient.on('end', () => {
      global.redisClient = null;
    });
    global.redisClient.on('ready', () => {
      console.log('redis connected');
    });

    await global.redisClient.connect();

    // 1 - 测试库，0 - 正式
    await global.redisClient.SELECT(0);

    return global.redisClient;
  } catch (error) {
    console.log(error, '==');
    global.redisClient = null;
    return Promise.reject('redis 连接失败');
  }
};

export const getKey = (prefix = '') => {
  return `${prefix}:${nanoid()}`;
};
