import { Schema } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DbConfigurationError } from '@fastgpt/dal/db/errors';
import { defineMongoCollection } from '@fastgpt/dal/db/mongo/collection';
import {
  dropManagedMongoIndexIfExists,
  inspectMongoIndexes,
  syncMongoCollectionIndexes
} from '@fastgpt/dal/db/mongo/indexSync';
import { createMongoTestHarness, type MongoTestHarness } from '@fastgpt/dal/db/testing';

describe('@fastgpt/dal/db/mongo additive index sync, collMod TTL, safe drops, and read-only inspect', () => {
  let harness: MongoTestHarness;

  beforeAll(async () => {
    harness = await createMongoTestHarness({ collections: [] });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('creates missing static & dynamic indexes, matches compound text & frozen legacy keys without Error 85, updates TTL via collMod, and never drops extra indexes', async () => {
    const colName = 'fg_sync_demo_col';
    const nativeCol = harness.client.connection.db!.collection(colName);

    // Pre-seed:
    // 1. A frozen legacy unprefixed index on { teamId: 1 } (same key as our new fg_sync_team declaration)
    await nativeCol.createIndex({ teamId: 1 }, { name: 'teamId_1' });
    // 2. A compound text index with leading teamId
    await nativeCol.createIndex({ teamId: 1, content: 'text' }, { name: 'teamId_1_content_text' });
    // 3. A TTL index with old 60s expiry
    await nativeCol.createIndex({ expireAt: 1 }, { name: 'expireAt_1', expireAfterSeconds: 60 });
    // 4. A customer DBA index and an extra managed fg_* index (neither may be dropped by sync!)
    await nativeCol.createIndex({ customerCol: 1 }, { name: 'dba_custom_idx' });
    await nativeCol.createIndex({ oldCol: 1 }, { name: 'fg_sync_retired' });

    const collectionDef = defineMongoCollection({
      name: colName,
      schema: new Schema(
        {
          teamId: String,
          content: String,
          status: String,
          expireAt: Date,
          dynamicFlag: String
        },
        { versionKey: false }
      ),
      indexes: [
        { key: { teamId: 1 }, options: { name: 'fg_sync_team' } },
        { key: { teamId: 1, content: 'text' } },
        { key: { expireAt: 1 }, options: { expireAfterSeconds: 3600 } },
        { key: { teamId: 1, status: 1 }, options: { name: 'fg_sync_team_status' } }
      ],
      resolveDynamicIndexes: () => [
        { key: { dynamicFlag: 1 }, options: { name: 'fg_sync_dynamic' } }
      ]
    });

    // 1. Read-only inspect BEFORE sync
    const beforeInspect = await inspectMongoIndexes({
      client: harness.client,
      collections: [collectionDef]
    });
    expect(beforeInspect.missingIndexes).toEqual([
      { collection: colName, indexName: 'fg_sync_team_status' },
      { collection: colName, indexName: 'fg_sync_dynamic' }
    ]);
    expect(beforeInspect.optionMismatches).toEqual([
      expect.objectContaining({
        collection: colName,
        liveName: 'expireAt_1'
      })
    ]);
    expect(beforeInspect.extraManagedIndexes).toEqual([
      { collection: colName, indexName: 'fg_sync_retired' }
    ]);
    expect(beforeInspect.legacyOrCustomerIndexes).toEqual([
      { collection: colName, indexName: 'dba_custom_idx' }
    ]);

    // 2. Run additive-only sync with allowCollModTtl=true
    const syncReport = await syncMongoCollectionIndexes({
      client: harness.client,
      collections: [collectionDef],
      allowCollModTtl: true
    });

    expect(syncReport.errors).toEqual([]);
    expect(syncReport.created).toEqual([
      { collection: colName, indexName: 'fg_sync_team_status' },
      { collection: colName, indexName: 'fg_sync_dynamic' }
    ]);
    expect(syncReport.ttlUpdated).toEqual([
      { collection: colName, indexName: 'expireAt_1', expireAfterSeconds: 3600 }
    ]);
    expect(syncReport.skippedExisting.map((s) => s.matchedLiveName)).toEqual([
      'teamId_1',
      'teamId_1_content_text'
    ]);

    // Verify customer DBA index & extra fg_* index were NEVER touched during startup sync
    const liveAfterSync = await nativeCol.indexes();
    const liveNames = liveAfterSync.map((idx) => idx.name);
    expect(liveNames).toContain('dba_custom_idx');
    expect(liveNames).toContain('fg_sync_retired');
    expect(liveNames).toContain('fg_sync_team_status');
    expect(liveNames).toContain('fg_sync_dynamic');
    expect(liveAfterSync.find((i) => i.name === 'expireAt_1')?.expireAfterSeconds).toBe(3600);

    // 3. Explicit one-off drop guardrails
    // Refuses non-fg_ customer index without expectedKey
    await expect(
      dropManagedMongoIndexIfExists({
        client: harness.client,
        collectionName: colName,
        indexName: 'dba_custom_idx'
      })
    ).rejects.toThrow(DbConfigurationError);

    // Refuses non-fg_ index when expectedKey mismatches
    const mismatchDrop = await dropManagedMongoIndexIfExists({
      client: harness.client,
      collectionName: colName,
      indexName: 'dba_custom_idx',
      expectedKey: { wrongField: 1 }
    });
    expect(mismatchDrop.status).toBe('skipped_mismatch');

    // Drops fg_* retired index cleanly
    const droppedManaged = await dropManagedMongoIndexIfExists({
      client: harness.client,
      collectionName: colName,
      indexName: 'fg_sync_retired'
    });
    expect(droppedManaged.status).toBe('dropped');

    // Customer DBA index still intact!
    const liveAfterDrop = (await nativeCol.indexes()).map((i) => i.name);
    expect(liveAfterDrop).toContain('dba_custom_idx');
    expect(liveAfterDrop).not.toContain('fg_sync_retired');
  });

  it('retries cleanly when MongoDB returns Error 285 (IndexBuildAlreadyInProgress)', async () => {
    let attempts = 0;
    const fakeClient = {
      connection: {
        db: {
          collection: () => ({
            indexes: async () => [],
            createIndex: async () => {
              attempts += 1;
              if (attempts < 3) {
                throw Object.assign(new Error('IndexBuildAlreadyInProgress'), { code: 285 });
              }
              return 'fg_retry_idx';
            }
          })
        }
      }
    } as any;

    const def = defineMongoCollection({
      name: 'retry_285_col',
      schema: new Schema({ a: String }, { versionKey: false }),
      indexes: [{ key: { a: 1 }, options: { name: 'fg_retry_idx' } }]
    });

    const report = await syncMongoCollectionIndexes({
      client: fakeClient,
      collections: [def],
      max285Retries: 5,
      retryDelayMs: 1
    });

    expect(attempts).toBe(3);
    expect(report.errors).toEqual([]);
    expect(report.created).toEqual([{ collection: 'retry_285_col', indexName: 'fg_retry_idx' }]);
  });
});
