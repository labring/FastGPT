import './mocks';
import { existsSync, readFileSync } from 'fs';
import { connectMongo } from '@fastgpt/service/common/mongo/init';
import { initGlobalVariables } from '@/service/common/system';
import { afterAll, beforeAll, beforeEach, inject, onTestFinished, vi } from 'vitest';
import setupModels from './setupModels';
import { clean } from './datas/users';
import { connectionLogMongo, connectionMongo } from '@fastgpt/service/common/mongo';
import { delay } from '@fastgpt/global/common/system/utils';

vi.stubEnv('NODE_ENV', 'test');

beforeAll(async () => {
  vi.stubEnv('MONGODB_URI', inject('MONGODB_URI'));
  await connectMongo({ db: connectionMongo, url: inject('MONGODB_URI') });
  await connectMongo({ db: connectionLogMongo, url: inject('MONGODB_URI') });

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
  await connectMongo({ db: connectionMongo, url: inject('MONGODB_URI') });
  await connectMongo({ db: connectionLogMongo, url: inject('MONGODB_URI') });

  onTestFinished(async () => {
    clean();

    // Ensure all sessions are closed before dropping database
    try {
      await Promise.all([
        connectionMongo?.connection.db?.dropDatabase(),
        connectionLogMongo?.connection.db?.dropDatabase()
      ]);
    } catch (error) {
      // Ignore errors during cleanup
      console.warn('Error during test cleanup:', error);
    }
  });
});

delay(1000);
