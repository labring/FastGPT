import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { parseHeaderCertMock } from '@/test/utils';
import { initMockData, root } from './db/init';
import { faker } from '@faker-js/faker/locale/zh_CN';

jest.mock('nanoid', () => {
  return {
    nanoid: () => {}
  };
});

jest.mock('@fastgpt/global/common/string/tools', () => {
  return {
    hashStr(str: string) {
      return str;
    },
    getNanoid() {
      return faker.string.alphanumeric(12);
    }
  };
});

jest.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    log: jest.fn(),
    warn: jest.fn((...prop) => {
      console.warn(prop);
    }),
    error: jest.fn((...prop) => {
      console.error(prop);
    }),
    info: jest.fn(),
    debug: jest.fn()
  }
}));

jest.setMock(
  '@fastgpt/service/support/permission/controller',
  (() => {
    const origin = jest.requireActual<
      typeof import('@fastgpt/service/support/permission/controller')
    >('@fastgpt/service/support/permission/controller');

    return {
      ...origin,
      parseHeaderCert: parseHeaderCertMock
    };
  })()
);

jest.mock('@/service/middleware/entry', () => {
  return {
    NextAPI: (...args: any) => {
      return async function api(req: any, res: any) {
        try {
          let response = null;
          for (const handler of args) {
            response = await handler(req, res);
          }
          return {
            code: 200,
            data: response
          };
        } catch (error) {
          return {
            code: 500,
            error
          };
        }
      };
    }
  };
});

beforeAll(async () => {
  // 新建一个内存数据库，然后让 mongoose 连接这个数据库
  if (!global.mongod || !global.mongodb) {
    const replSet = new MongoMemoryReplSet({
      instanceOpts: [
        {
          storageEngine: 'wiredTiger'
        },
        {
          storageEngine: 'wiredTiger'
        }
      ]
    });
    replSet.start();
    await replSet.waitUntilRunning();
    const uri = replSet.getUri();
    // const mongod = await MongoMemoryServer.create({
    //   instance: {
    //     replSet: 'testset'
    //   }
    // });
    // global.mongod = mongod;
    global.replSet = replSet;
    global.mongodb = mongoose;

    await global.mongodb.connect(uri, {
      dbName: 'fastgpt_test',
      bufferCommands: true,
      maxConnecting: 50,
      maxPoolSize: 50,
      minPoolSize: 20,
      connectTimeoutMS: 60000,
      waitQueueTimeoutMS: 60000,
      socketTimeoutMS: 60000,
      maxIdleTimeMS: 300000,
      retryWrites: true,
      retryReads: true
    });

    await initMockData();
    console.log(root);
  }
});

afterAll(async () => {
  if (global.mongodb) {
    await global.mongodb.disconnect();
  }
  if (global.replSet) {
    await global.replSet.stop();
  }
  if (global.mongod) {
    await global.mongod.stop();
  }
});
