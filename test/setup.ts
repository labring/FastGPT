import './mocks';
import { existsSync, readFileSync } from 'fs';
import { connectMongo } from '@fastgpt/service/common/mongo/init';
import { initGlobalVariables } from '@/service/common/system';
import { afterAll, afterEach, beforeAll, beforeEach, inject, vi } from 'vitest';
import setupModels from './setupModels';
import { clean } from './datas/users';
import { connectionMongo } from '@fastgpt/service/common/mongo';
import { randomUUID } from 'crypto';
import { delay } from '@fastgpt/global/common/system/utils';

vi.stubEnv('NODE_ENV', 'test');
// vi.mock(import('@fastgpt/service/common/mongo'), async (importOriginal) => {
//   const mod = await importOriginal();
//   return {
//     ...mod,
//     connectionMongo: await (async () => {
//       if (!global.mongodb) {
//         global.mongodb = mongoose;
//         await global.mongodb.connect((globalThis as any).__MONGO_URI__ as string, {
//           timeoutMS: 3000
//         });
//       }

//       return global.mongodb;
//     })()
//   };
// });

vi.mock(import('@fastgpt/service/common/mongo/init'), async (importOriginal: any) => {
  const mod = await importOriginal();
  const uri = inject('MONGODB_URI');
  return {
    ...mod,
    connectMongo: async () => {
      (await connectionMongo.connect(uri)).connection.useDb(randomUUID());
      await delay(500);
      // (connectionMongo as typeof mongoose)
      // .connection.useDb(randomUUID());
    }
  };
});

vi.mock(import('@/service/common/system'), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    getSystemVersion: async () => {
      return '0.0.0';
    },
    readConfigData: async () => {
      return readFileSync('@/data/config.json', 'utf-8');
    },
    initSystemConfig: async () => {
      // read env from projects/app/.env

      const str = readFileSync('projects/app/.env.local', 'utf-8');
      const lines = str.split('\n');
      const systemEnv: Record<string, string> = {};
      for (const line of lines) {
        const [key, value] = line.split('=');
        if (key && value) {
          systemEnv[key] = value;
        }
      }
      global.systemEnv = systemEnv as any;

      return;
    }
  };
});

beforeAll(async () => {
  vi.stubEnv('MONGODB_URI', inject('MONGODB_URI'));
  await connectMongo();

  initGlobalVariables();

  // await getInitConfig();
  if (existsSync('projects/app/.env.local')) {
    const str = readFileSync('projects/app/.env.local', 'utf-8');
    const lines = str.split('\n');
    const systemEnv: Record<string, string> = {};
    for (const line of lines) {
      const [key, value] = line.split('=');
      if (key && value && !key.startsWith('#')) {
        systemEnv[key] = value;
      }
    }
    global.systemEnv = {} as any;
    global.systemEnv.oneapiUrl = systemEnv['OPENAI_BASE_URL'];
    global.systemEnv.chatApiKey = systemEnv['CHAT_API_KEY'];
    await setupModels();
  }
});

afterAll(async () => {
  if (global?.mongodb?.connection) global.mongodb?.connection.close();
});

beforeEach(async () => {
  await connectMongo();
  return async () => {
    clean();
    await global.mongodb?.connection.db?.dropDatabase();
  };
});
