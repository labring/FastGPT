import { createClient, SchemaFieldTypes } from 'redis';
import { ModelDataIndex } from '@/constants/redis';
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
      url: 'redis://default:121914yu@120.76.193.200:8100'
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

    // 0 - 测试库，1 - 正式
    await global.redisClient.select(0);

    // 创建索引
    try {
      await global.redisClient.ft.create(
        ModelDataIndex,
        {
          // '$.vector': SchemaFieldTypes.VECTOR,
          '$.modelId': {
            type: SchemaFieldTypes.TEXT,
            AS: 'modelId'
          },
          '$.userId': {
            type: SchemaFieldTypes.TEXT,
            AS: 'userId'
          },
          '$.status': {
            type: SchemaFieldTypes.NUMERIC,
            AS: 'status'
          }
        },
        {
          ON: 'JSON',
          PREFIX: 'model:data'
        }
      );
    } catch (error) {
      console.log('创建索引失败', error);
    }

    // await global.redisClient.json.set('fastgpt:modeldata:2', '$', {
    //   vector: [124, 214, 412, 4, 124, 1, 4, 1, 4, 3, 423],
    //   modelId: 'daf',
    //   userId: 'adfd',
    //   q: 'fasf',
    //   a: 'afasf',
    //   status: 0,
    //   createTime: new Date()
    // });
    // const value = await global.redisClient.json.get('fastgpt:modeldata:2');

    // console.log(value);
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
