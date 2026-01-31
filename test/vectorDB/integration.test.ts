/**
 * Vector DB integration tests: same suite (factory + fixtures) for each driver.
 * Enable a driver by setting the corresponding env in test/.env.test.local (see .env.test.template).
 */
import { describe, vi } from 'vitest';
import type { VectorDBDriver } from './factory';
import { runVectorDBTests } from './factory';

vi.unmock('@fastgpt/service/common/vectorDB/constants');

const drivers: VectorDBDriver[] = [
  {
    name: 'PgVectorCtrl',
    envKey: 'PG_URL',
    createCtrl: async () => {
      vi.unmock('@fastgpt/service/common/vectorDB/pg');
      const { PgVectorCtrl } = await import('@fastgpt/service/common/vectorDB/pg');
      return new PgVectorCtrl();
    }
  }
  // Add more drivers (Oceanbase, Milvus) with same pattern:
  // { name: 'ObVectorCtrl', envKey: 'OCEANBASE_URL', createCtrl: async () => { ... } },
  // { name: 'MilvusCtrl', envKey: 'MILVUS_ADDRESS', createCtrl: async () => { ... } },
];

drivers.forEach((driver) => {
  describe.skipIf(!process.env[driver.envKey])(
    `${driver.name} 集成测试`,
    () => {
      runVectorDBTests(driver);
    }
  );
});
