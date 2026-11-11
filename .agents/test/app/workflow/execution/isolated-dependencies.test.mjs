import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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
