import { createClient, SchemaFieldTypes } from 'redis';

export const connectRedis = async () => {
  // 断开了，重连
  if (global.redisClient && !global.redisClient.isOpen) {
    await global.redisClient.disconnect();
  } else if (global.redisClient) {
    // 没断开，不再连接
    return;
  }

  try {
    global.redisClient = createClient({
      url: 'redis://:121914yu@120.76.193.200:8100'
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
    await global.redisClient.ft.create(
      'vec:question',
      {
        '$.vector': SchemaFieldTypes.VECTOR,
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
        PREFIX: 'fastgpt:modeldata'
      }
    );

    // await global.redisClient.json.set('fastgpt:modeldata:1', '$', {
    //   vector: [],
    //   modelId: 'daf',
    //   userId: 'adfd',
    //   q: 'fasf',
    //   a: 'afasf',
    //   status: 0,
    //   createTime: new Date()
    // });
    // const value = await global.redisClient.get('fastgpt:modeldata:1');

    // console.log(value);
  } catch (error) {
    console.log(error, '==');
    global.redisClient = null;
    return Promise.reject('redis 连接失败');
  }
};
