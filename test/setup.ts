import { existsSync, readFileSync } from 'fs';
import mongoose from '@fastgpt/service/common/mongo';
import { connectMongo } from '@fastgpt/service/common/mongo/init';
import { initGlobalVariables } from '@/service/common/system';
import { afterAll, beforeAll, vi } from 'vitest';
import { setup, teardown } from 'vitest-mongodb';
import setupModels from './setupModels';
import './mocks';

vi.stubEnv('NODE_ENV', 'test');
vi.mock(import('@fastgpt/service/common/mongo'), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    connectionMongo: await (async () => {
      if (!global.mongodb) {
        global.mongodb = mongoose;
        await global.mongodb.connect((globalThis as any).__MONGO_URI__ as string);
      }

      return global.mongodb;
    })()
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
  await setup({
    type: 'replSet',
    serverOptions: {
      replSet: {
        count: 4
      }
    }
  });
  vi.stubEnv('MONGODB_URI', (globalThis as any).__MONGO_URI__);
  initGlobalVariables();
  await connectMongo();

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
  await teardown();
});
