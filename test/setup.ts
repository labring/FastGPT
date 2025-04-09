import './mocks';
import { existsSync, readFileSync } from 'fs';
import { connectMongo } from '@fastgpt/service/common/mongo/init';
import { initGlobalVariables } from '@/service/common/system';
import { afterAll, beforeAll, beforeEach, inject, vi } from 'vitest';
import setupModels from './setupModels';
import { clean } from './datas/users';
import { connectionLogMongo, connectionMongo, Mongoose } from '@fastgpt/service/common/mongo';
import { randomUUID } from 'crypto';

vi.stubEnv('NODE_ENV', 'test');

vi.mock(import('@fastgpt/service/common/mongo/init'), async (importOriginal: any) => {
  const mod = await importOriginal();
  return {
    ...mod,
    connectMongo: async (db: Mongoose, url: string) => {
      (await db.connect(url)).connection.useDb(randomUUID());
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
  await connectMongo(connectionMongo, inject('MONGODB_URI'));
  await connectMongo(connectionLogMongo, inject('MONGODB_URI'));

  initGlobalVariables();
  global.systemEnv = {} as any;

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
    global.systemEnv.oneapiUrl = systemEnv['OPENAI_BASE_URL'];
    global.systemEnv.chatApiKey = systemEnv['CHAT_API_KEY'];
  }
  global.feConfigs = {
    isPlus: false
  } as any;
  await setupModels();
});

afterAll(async () => {
  if (connectionMongo?.connection) connectionMongo?.connection.close();
  if (connectionLogMongo?.connection) connectionLogMongo?.connection.close();
});

beforeEach(async () => {
  await connectMongo(connectionMongo, inject('MONGODB_URI'));
  await connectMongo(connectionLogMongo, inject('MONGODB_URI'));

  return async () => {
    clean();
    await connectionMongo?.connection.db?.dropDatabase();
    await connectionLogMongo?.connection.db?.dropDatabase();
  };
});
