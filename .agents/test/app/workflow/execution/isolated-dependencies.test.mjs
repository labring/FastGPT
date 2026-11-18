import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertPrivateRedisInstance } from '../../../support/private.mjs';
import { Blocked } from '../../../support/runtime.mjs';
import {
  assertIsolatedMongoTarget,
  deriveIsolatedConnections
} from '../../../support/isolated-dependencies.mjs';

const input = {
  mongoUri: 'mongodb://test:password@100.96.142.32:27017/dev?authSource=admin',
  redisUri: 'redis://:password@100.96.142.32:6379/15',
  pgUri: 'postgresql://test:password@100.96.142.32:5432/dev',
  runId: 'a'.repeat(32),
  redisDb: 11
};

describe('workflow integration dependency isolation', () => {
  it('derives run-specific Mongo/PostgreSQL databases and a non-default Redis DB', () => {
    const result = deriveIsolatedConnections(input);
    assert.equal(result.database, `fg_it_${input.runId}`);
    assert.equal(new URL(result.mongoUri).pathname, `/${result.database}`);
    assert.equal(new URL(result.mongoLogUri).pathname, `/${result.database}_log`);
    assert.equal(new URL(result.pgUri).pathname, `/${result.database}`);
    assert.equal(new URL(result.redisUri).pathname, '/11');
    assert.equal(new URL(result.mongoUri).searchParams.get('authSource'), 'admin');
  });

  it('rejects local or unexpected database hosts and unsafe database identities', () => {
    for (const overrides of [
      { mongoUri: 'mongodb://127.0.0.1:27017/dev' },
      { redisUri: 'redis://127.0.0.1:6379/15' },
      { pgUri: 'postgresql://127.0.0.1:5432/dev' },
      { runId: 'dev' },
      { redisDb: 0 },
      { redisDb: 16 }
    ]) {
      assert.throws(() => deriveIsolatedConnections({ ...input, ...overrides }));
    }
  });

  it('rejects Redis instance-wide pressure testing when only a logical DB is reserved', async () => {
    const marker = 'owned-db-marker';
    const { redisUri } = deriveIsolatedConnections(input);
    const c = {
      fixture: {
        isolated: true,
        redis: { uriEnv: 'TEST_REDIS' },
        privateEnvironment: { id: input.runId, nonceEnv: 'TEST_NONCE' }
      },
      secret: (key) => ({ TEST_REDIS: redisUri, TEST_NONCE: marker })[key]
    };
    const runId = 'a'.repeat(40);
    const redis = {
      info: async (section) => {
        assert.equal(section, 'server');
        return '# Server\r\nrun_id:' + runId + '\r\n';
      },
      get: async (key) => {
        assert.equal(key, 'fgtest:environment:' + input.runId);
        return marker;
      }
    };
    const approved = (runId) => ({
      ...c,
      secret: (key) => (key === 'FASTGPT_TEST_DEDICATED_REDIS_RUN_ID' ? runId : c.secret(key))
    });
    await assert.rejects(() => assertPrivateRedisInstance(c, redis), Blocked);
    await assert.rejects(
      () => assertPrivateRedisInstance(approved('b'.repeat(40)), redis),
      Blocked
    );
    await assert.rejects(
      () =>
        assertPrivateRedisInstance(
          {
            ...approved(runId),
            fixture: { ...c.fixture, environment: 'local-dev' }
          },
          redis
        ),
      Blocked
    );
    await assertPrivateRedisInstance(approved(runId), redis);
  });

  it('refuses a fixture that does not point to its own random Mongo database', () => {
    const { database, mongoUri } = deriveIsolatedConnections(input);
    assert.doesNotThrow(() =>
      assertIsolatedMongoTarget({ mongoUri, database, runId: input.runId })
    );
    assert.throws(() =>
      assertIsolatedMongoTarget({ mongoUri: input.mongoUri, database, runId: input.runId })
    );
    assert.throws(() => assertIsolatedMongoTarget({ mongoUri, database, runId: 'b'.repeat(32) }));
  });
});
