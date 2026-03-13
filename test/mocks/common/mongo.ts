import { vi } from 'vitest';
import { randomUUID } from 'crypto';
import type { Mongoose } from '@fastgpt/service/common/mongo';

/**
 * Mock MongoDB connection for testing
 * Creates a unique database for each test run and drops it on connection
 */
vi.mock(import('@fastgpt/service/common/mongo/init'), async (importOriginal: any) => {
  const mod = await importOriginal();
  return {
    ...mod,
    connectMongo: async (props: { db: Mongoose; url: string; connectedCb?: () => void }) => {
      const { db, url } = props;
      await db.connect(url, { dbName: randomUUID() });
      await db.connection.db?.dropDatabase();
    }
  };
});

/**
 * Mock mongoSessionRun to avoid transaction issues in tests
 * MongoDB transactions require replica set, which may not be available in test environment
 */
vi.mock(import('@fastgpt/service/common/mongo/sessionRun'), async () => {
  return {
    mongoSessionRun: vi.fn(async (fn) => {
      // Execute the function without a real session
      return await fn(null as any);
    })
  };
});
