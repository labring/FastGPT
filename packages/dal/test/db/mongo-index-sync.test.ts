import { Schema } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DbConfigurationError } from '@fastgpt/dal/db/errors';
import { defineMongoCollection } from '@fastgpt/dal/db/mongo/collection';
import {
  dropManagedMongoIndexIfExists,
  hasMatchingMongoIndex,
  inspectMongoIndexes,
  syncMongoCollectionIndexes,
  type LiveMongoIndexSpec
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

  it('does not let a live partial, unique, sparse, TTL, or collation index mask a missing full index', async () => {
    const buildFakeClient = ({
      liveIndexes,
      createIndexImpl = vi.fn().mockResolvedValue('created')
    }: {
      liveIndexes: LiveMongoIndexSpec[];
      createIndexImpl?: ReturnType<typeof vi.fn>;
    }) => {
      const command = vi.fn();
      const client = {
        connection: {
          db: {
            command,
            collection: () => ({
              indexes: vi.fn().mockResolvedValue(liveIndexes),
              createIndex: createIndexImpl
            })
          }
        }
      } as any;
      return { client, createIndex: createIndexImpl, command };
    };

    const fullDef = defineMongoCollection({
      name: 'equiv_guard_col',
      schema: new Schema({ teamId: String }, { versionKey: false }),
      indexes: [{ key: { teamId: 1 }, options: { name: 'fg_equiv_team' } }]
    });

    // 1. 现网仅有同 key 异名的 partial 索引：既不满足全量索引声明，又可与全量索引共存 -> inspect 报缺失、sync 发起补建
    {
      const { client, createIndex } = buildFakeClient({
        liveIndexes: [
          { name: '_id_', key: { _id: 1 } },
          {
            name: 'teamId_partial_idx',
            key: { teamId: 1 },
            partialFilterExpression: { active: true }
          }
        ]
      });

      const inspect = await inspectMongoIndexes({ client, collections: [fullDef] });
      expect(inspect.missingIndexes).toEqual([
        { collection: 'equiv_guard_col', indexName: 'fg_equiv_team' }
      ]);
      expect(inspect.optionMismatches).toEqual([]);
      expect(inspect.legacyOrCustomerIndexes).toEqual([
        { collection: 'equiv_guard_col', indexName: 'teamId_partial_idx' }
      ]);

      const sync = await syncMongoCollectionIndexes({ client, collections: [fullDef] });
      expect(createIndex).toHaveBeenCalledTimes(1);
      expect(sync.created).toEqual([{ collection: 'equiv_guard_col', indexName: 'fg_equiv_team' }]);
      expect(sync.skippedExisting).toEqual([]);
    }

    // 2. 现网仅有同 key 异名的 unique 索引（互斥不可共存）：inspect 必报 optionMismatches，sync 尝试建索引遇 85 记录漂移告警且绝不误记 skippedExisting
    {
      const conflictError = Object.assign(
        new Error('An existing index has the same key with different options'),
        { code: 85 }
      );
      const { client, createIndex } = buildFakeClient({
        liveIndexes: [
          { name: '_id_', key: { _id: 1 } },
          { name: 'teamId_unique_idx', key: { teamId: 1 }, unique: true }
        ],
        createIndexImpl: vi.fn().mockRejectedValue(conflictError)
      });

      const inspect = await inspectMongoIndexes({ client, collections: [fullDef] });
      expect(inspect.missingIndexes).toEqual([]);
      expect(inspect.optionMismatches).toEqual([
        {
          collection: 'equiv_guard_col',
          indexName: 'fg_equiv_team',
          liveName: 'teamId_unique_idx',
          reason: 'unique mismatch (declared=false, live=true)'
        }
      ]);

      const sync = await syncMongoCollectionIndexes({ client, collections: [fullDef] });
      expect(createIndex).toHaveBeenCalledTimes(1);
      expect(sync.skippedExisting).toEqual([]);
      expect(sync.created).toEqual([]);
      expect(sync.optionDriftWarnings).toHaveLength(1);
    }

    // 3. 现网仅有同 key 异名的 sparse / unexpected-TTL 索引：inspect 必报 optionMismatches，绝不静默零漂移
    for (const [liveSpec, expectedReason] of [
      [
        { name: 'teamId_sparse_idx', key: { teamId: 1 }, sparse: true },
        'sparse mismatch (declared=false, live=true)'
      ],
      [
        { name: 'teamId_ttl_idx', key: { teamId: 1 }, expireAfterSeconds: 300 },
        'expireAfterSeconds mismatch (declared=undefined, live=300)'
      ]
    ] as const) {
      const { client } = buildFakeClient({
        liveIndexes: [{ name: '_id_', key: { _id: 1 } }, liveSpec]
      });
      const inspect = await inspectMongoIndexes({ client, collections: [fullDef] });
      expect(inspect.optionMismatches).toEqual([
        {
          collection: 'equiv_guard_col',
          indexName: 'fg_equiv_team',
          liveName: liveSpec.name,
          reason: expectedReason
        }
      ]);
    }

    // 4. 同名但现网为 partial 索引：inspect 报 optionMismatches，sync 报 optionDriftWarnings 且不调用 createIndex
    {
      const { client, createIndex } = buildFakeClient({
        liveIndexes: [
          { name: '_id_', key: { _id: 1 } },
          {
            name: 'fg_equiv_team',
            key: { teamId: 1 },
            partialFilterExpression: { active: true }
          }
        ]
      });

      const inspect = await inspectMongoIndexes({ client, collections: [fullDef] });
      expect(inspect.missingIndexes).toEqual([]);
      expect(inspect.optionMismatches).toEqual([
        {
          collection: 'equiv_guard_col',
          indexName: 'fg_equiv_team',
          liveName: 'fg_equiv_team',
          reason: 'partialFilterExpression mismatch'
        }
      ]);

      const sync = await syncMongoCollectionIndexes({ client, collections: [fullDef] });
      expect(createIndex).not.toHaveBeenCalled();
      expect(sync.skippedExisting).toEqual([]);
      expect(sync.optionDriftWarnings).toEqual([
        {
          collection: 'equiv_guard_col',
          indexName: 'fg_equiv_team',
          reason: 'partialFilterExpression mismatch'
        }
      ]);
    }

    // 5. 同 key 同时存在全量索引与 partial 索引（全量索引在前、partial 在后）：绝不能因 Map 覆盖把全量索引顶掉
    {
      const { client, createIndex } = buildFakeClient({
        liveIndexes: [
          { name: '_id_', key: { _id: 1 } },
          { name: 'teamId_1', key: { teamId: 1 } },
          {
            name: 'teamId_partial_idx',
            key: { teamId: 1 },
            partialFilterExpression: { deleted: false }
          }
        ]
      });

      const inspect = await inspectMongoIndexes({ client, collections: [fullDef] });
      expect(inspect.missingIndexes).toEqual([]);
      expect(inspect.optionMismatches).toEqual([]);
      expect(inspect.legacyOrCustomerIndexes).toEqual([
        { collection: 'equiv_guard_col', indexName: 'teamId_partial_idx' }
      ]);

      const sync = await syncMongoCollectionIndexes({ client, collections: [fullDef] });
      expect(createIndex).not.toHaveBeenCalled();
      expect(sync.optionDriftWarnings).toEqual([]);
      expect(sync.skippedExisting).toEqual([
        { collection: 'equiv_guard_col', indexName: 'fg_equiv_team', matchedLiveName: 'teamId_1' }
      ]);
    }

    // 6. 现网 partial TTL 索引不能被 collMod 误当作全量 TTL 索引更新
    {
      const ttlDef = defineMongoCollection({
        name: 'ttl_partial_guard_col',
        schema: new Schema({ expireAt: Date }, { versionKey: false }),
        indexes: [
          { key: { expireAt: 1 }, options: { name: 'fg_ttl_full', expireAfterSeconds: 3600 } }
        ]
      });
      const { client, createIndex, command } = buildFakeClient({
        liveIndexes: [
          { name: '_id_', key: { _id: 1 } },
          {
            name: 'expireAt_partial_ttl',
            key: { expireAt: 1 },
            expireAfterSeconds: 60,
            partialFilterExpression: { active: true }
          }
        ]
      });

      const sync = await syncMongoCollectionIndexes({
        client,
        collections: [ttlDef],
        allowCollModTtl: true
      });
      expect(command).not.toHaveBeenCalled();
      expect(createIndex).toHaveBeenCalledTimes(1);
      expect(sync.ttlUpdated).toEqual([]);
      expect(sync.created).toEqual([
        { collection: 'ttl_partial_guard_col', indexName: 'fg_ttl_full' }
      ]);
    }
  });

  it('compares full collation and text index options (weights, default_language, language_override)', async () => {
    const buildClient = (liveIndexes: LiveMongoIndexSpec[]) =>
      ({
        connection: {
          db: {
            collection: () => ({
              indexes: vi.fn().mockResolvedValue(liveIndexes),
              createIndex: vi.fn().mockResolvedValue('created')
            })
          }
        }
      }) as any;

    // 1. Collation 声明与 MongoDB 展开返回态（含默认项及 ICU version）等价，但 strength 不同必报错
    const collationDef = defineMongoCollection({
      name: 'collation_col',
      schema: new Schema({ name: String }, { versionKey: false }),
      indexes: [
        {
          key: { name: 1 },
          options: { name: 'fg_name_en', collation: { locale: 'en', strength: 2 } }
        }
      ]
    });

    const expandedMatchingInspect = await inspectMongoIndexes({
      client: buildClient([
        {
          name: 'fg_name_en',
          key: { name: 1 },
          collation: {
            locale: 'en',
            caseLevel: false,
            caseFirst: 'off',
            strength: 2,
            numericOrdering: false,
            alternate: 'non-ignorable',
            maxVariable: 'punct',
            normalization: false,
            backwards: false,
            version: '57.1'
          }
        }
      ]),
      collections: [collationDef]
    });
    expect(expandedMatchingInspect.missingIndexes).toEqual([]);
    expect(expandedMatchingInspect.optionMismatches).toEqual([]);

    const wrongStrengthInspect = await inspectMongoIndexes({
      client: buildClient([
        {
          name: 'fg_name_en',
          key: { name: 1 },
          collation: { locale: 'en', strength: 1 }
        }
      ]),
      collections: [collationDef]
    });
    expect(wrongStrengthInspect.optionMismatches).toEqual([
      {
        collection: 'collation_col',
        indexName: 'fg_name_en',
        liveName: 'fg_name_en',
        reason: 'collation mismatch'
      }
    ]);

    // 2. Text 索引 weights / default_language / language_override 漂移必须被识别
    const textDef = defineMongoCollection({
      name: 'text_opts_col',
      schema: new Schema({ title: String, body: String }, { versionKey: false }),
      indexes: [
        {
          key: { title: 'text', body: 'text' },
          options: {
            name: 'fg_text_search',
            weights: { title: 10, body: 1 },
            default_language: 'english',
            language_override: 'lang'
          }
        }
      ]
    });

    const driftedWeights = await inspectMongoIndexes({
      client: buildClient([
        {
          name: 'legacy_text',
          key: { _fts: 'text', _ftsx: 1 },
          weights: { title: 1, body: 1 },
          default_language: 'english',
          language_override: 'lang'
        }
      ]),
      collections: [textDef]
    });
    expect(driftedWeights.optionMismatches).toEqual([
      {
        collection: 'text_opts_col',
        indexName: 'fg_text_search',
        liveName: 'legacy_text',
        reason: 'weights mismatch'
      }
    ]);

    const driftedLanguage = await inspectMongoIndexes({
      client: buildClient([
        {
          name: 'legacy_text',
          key: { _fts: 'text', _ftsx: 1 },
          weights: { title: 10, body: 1 },
          default_language: 'none',
          language_override: 'lang'
        }
      ]),
      collections: [textDef]
    });
    expect(driftedLanguage.optionMismatches).toEqual([
      {
        collection: 'text_opts_col',
        indexName: 'fg_text_search',
        liveName: 'legacy_text',
        reason: 'default_language mismatch (declared=english, live=none)'
      }
    ]);

    const driftedOverride = await inspectMongoIndexes({
      client: buildClient([
        {
          name: 'legacy_text',
          key: { _fts: 'text', _ftsx: 1 },
          weights: { title: 10, body: 1 },
          default_language: 'english',
          language_override: 'language'
        }
      ]),
      collections: [textDef]
    });
    expect(driftedOverride.optionMismatches).toEqual([
      {
        collection: 'text_opts_col',
        indexName: 'fg_text_search',
        liveName: 'legacy_text',
        reason: 'language_override mismatch (declared=lang, live=language)'
      }
    ]);
  });

  it('creates a declared full index alongside an existing coexistent partial index on real MongoDB', async () => {
    const colName = 'fg_coexist_partial_full';
    const nativeCol = harness.client.connection.db!.collection(colName);
    await nativeCol.createIndex(
      { teamId: 1 },
      { name: 'customer_partial_team', partialFilterExpression: { active: true } }
    );

    const def = defineMongoCollection({
      name: colName,
      schema: new Schema({ teamId: String, active: Boolean }, { versionKey: false }),
      indexes: [{ key: { teamId: 1 }, options: { name: 'fg_coexist_team_full' } }]
    });

    const beforeInspect = await inspectMongoIndexes({ client: harness.client, collections: [def] });
    expect(beforeInspect.missingIndexes).toEqual([
      { collection: colName, indexName: 'fg_coexist_team_full' }
    ]);

    const syncReport = await syncMongoCollectionIndexes({
      client: harness.client,
      collections: [def]
    });
    expect(syncReport.errors).toEqual([]);
    expect(syncReport.created).toEqual([
      { collection: colName, indexName: 'fg_coexist_team_full' }
    ]);

    const liveNames = (await nativeCol.indexes()).map((idx) => idx.name);
    expect(liveNames).toContain('customer_partial_team');
    expect(liveNames).toContain('fg_coexist_team_full');

    const afterInspect = await inspectMongoIndexes({ client: harness.client, collections: [def] });
    expect(afterInspect.missingIndexes).toEqual([]);
    expect(afterInspect.optionMismatches).toEqual([]);
    expect(afterInspect.legacyOrCustomerIndexes).toEqual([
      { collection: colName, indexName: 'customer_partial_team' }
    ]);
  });

  it('enforces full option signature in dropManagedMongoIndexIfExists even when expectedOptions is omitted or empty', async () => {
    const buildDropClient = (live: LiveMongoIndexSpec) => {
      const dropIndex = vi.fn().mockResolvedValue({ ok: 1 });
      const client = {
        connection: {
          db: {
            collection: () => ({
              indexes: vi.fn().mockResolvedValue([{ name: '_id_', key: { _id: 1 } }, live]),
              dropIndex
            })
          }
        }
      } as any;
      return { client, dropIndex };
    };

    const unexpectedVariants: Array<{ label: string; live: LiveMongoIndexSpec }> = [
      {
        label: 'partialFilterExpression',
        live: {
          name: 'userId_1',
          key: { userId: 1 },
          partialFilterExpression: { status: 'active' }
        }
      },
      {
        label: 'unique',
        live: { name: 'userId_1', key: { userId: 1 }, unique: true }
      },
      {
        label: 'sparse',
        live: { name: 'userId_1', key: { userId: 1 }, sparse: true }
      },
      {
        label: 'expireAfterSeconds',
        live: { name: 'userId_1', key: { userId: 1 }, expireAfterSeconds: 86400 }
      },
      {
        label: 'collation',
        live: {
          name: 'userId_1',
          key: { userId: 1 },
          collation: { locale: 'en', strength: 2 }
        }
      }
    ];

    for (const { live } of unexpectedVariants) {
      // 省略 expectedOptions 时必须按全默认普通索引比对，绝不跳过校验
      const omittedCase = buildDropClient(live);
      const omittedRes = await dropManagedMongoIndexIfExists({
        client: omittedCase.client,
        collectionName: 'team_members',
        indexName: 'userId_1',
        expectedKey: { userId: 1 }
      });
      expect(omittedRes.status).toBe('skipped_mismatch');
      expect(omittedCase.dropIndex).not.toHaveBeenCalled();

      // 显式传空对象 expectedOptions: {} 同样必须拒绝删除
      const emptyCase = buildDropClient(live);
      const emptyRes = await dropManagedMongoIndexIfExists({
        client: emptyCase.client,
        collectionName: 'team_members',
        indexName: 'userId_1',
        expectedKey: { userId: 1 },
        expectedOptions: {}
      });
      expect(emptyRes.status).toBe('skipped_mismatch');
      expect(emptyCase.dropIndex).not.toHaveBeenCalled();
    }

    // collation 完全一致（忽略服务端 ICU version）时才允许删除
    const matchingCollation = buildDropClient({
      name: 'userId_1',
      key: { userId: 1 },
      collation: {
        locale: 'en',
        strength: 2,
        caseLevel: false,
        caseFirst: 'off',
        numericOrdering: false,
        alternate: 'non-ignorable',
        maxVariable: 'punct',
        normalization: false,
        backwards: false,
        version: '57.1'
      }
    });
    const droppedCollation = await dropManagedMongoIndexIfExists({
      client: matchingCollation.client,
      collectionName: 'team_members',
      indexName: 'userId_1',
      expectedKey: { userId: 1 },
      expectedOptions: { collation: { locale: 'en', strength: 2 } }
    });
    expect(droppedCollation.status).toBe('dropped');
    expect(matchingCollation.dropIndex).toHaveBeenCalledWith('userId_1');
  });

  it('verifies exact key, option parity, hidden exclusion, and $indexStats/explain fallback in hasMatchingMongoIndex', async () => {
    const mockClient = ({
      indexes,
      stats,
      statsError,
      usableNames
    }: {
      indexes: Array<Record<string, unknown>>;
      stats?: Array<Record<string, unknown>>;
      statsError?: Error & { code?: number };
      usableNames?: readonly string[];
    }) =>
      ({
        connection: {
          db: {
            collection: () => ({
              indexes: async () => [{ name: '_id_', key: { _id: 1 } }, ...indexes],
              aggregate: () => ({
                toArray: async () => {
                  if (statsError !== undefined) {
                    throw statsError;
                  }
                  return (
                    stats ??
                    indexes.map((item) => ({
                      name: item.name,
                      spec: { hidden: item.hidden === true }
                    }))
                  );
                }
              }),
              find: () => ({
                hint: (name: string) => ({
                  limit: () => ({
                    explain: async () => {
                      if (usableNames !== undefined && !usableNames.includes(name)) {
                        const err = new Error(
                          'hint provided does not correspond to an existing index'
                        ) as Error & { code?: number };
                        err.code = 2;
                        throw err;
                      }
                      return { queryPlanner: { winningPlan: { stage: 'IXSCAN' } } };
                    }
                  })
                })
              })
            })
          }
        }
      }) as any;

    const partialOnly = mockClient({
      indexes: [
        {
          name: 'partial_cursor',
          key: { appId: 1, updateTime: -1, _id: -1 },
          partialFilterExpression: { appId: { $exists: true } }
        }
      ]
    });
    await expect(
      hasMatchingMongoIndex({
        client: partialOnly,
        collectionName: 'chats',
        key: { appId: 1, updateTime: -1, _id: -1 },
        options: {}
      })
    ).resolves.toBe(false);

    // 隐藏索引与构建中索引（$indexStats.building === true）均必须返回 false
    const hiddenAndBuilding = mockClient({
      indexes: [
        {
          name: 'hidden_cursor',
          key: { appId: 1, updateTime: -1, _id: -1 },
          hidden: true
        },
        {
          name: 'building_cursor',
          key: { teamId: 1, createTime: 1 }
        }
      ],
      stats: [
        { name: 'hidden_cursor', spec: { hidden: true } },
        { name: 'building_cursor', building: true, spec: {} }
      ]
    });
    await expect(
      hasMatchingMongoIndex({
        client: hiddenAndBuilding,
        collectionName: 'chats',
        key: { appId: 1, updateTime: -1, _id: -1 },
        options: {}
      })
    ).resolves.toBe(false);
    await expect(
      hasMatchingMongoIndex({
        client: hiddenAndBuilding,
        collectionName: 'datasets',
        key: { teamId: 1, createTime: 1 },
        options: {}
      })
    ).resolves.toBe(false);

    // $indexStats 遇权限受限（Error 13 Unauthorized）时降级使用 explain(queryPlanner) 判可用性
    const unauthorizedErr = Object.assign(new Error('not authorized'), { code: 13 });
    const fallbackUnusable = mockClient({
      indexes: [{ name: 'building_cursor', key: { appId: 1, updateTime: -1, _id: -1 } }],
      statsError: unauthorizedErr,
      usableNames: []
    });
    await expect(
      hasMatchingMongoIndex({
        client: fallbackUnusable,
        collectionName: 'chats',
        key: { appId: 1, updateTime: -1, _id: -1 },
        options: {}
      })
    ).resolves.toBe(false);

    const fallbackUsable = mockClient({
      indexes: [{ name: 'ready_cursor', key: { appId: 1, updateTime: -1, _id: -1 } }],
      statsError: unauthorizedErr,
      usableNames: ['ready_cursor']
    });
    await expect(
      hasMatchingMongoIndex({
        client: fallbackUsable,
        collectionName: 'chats',
        key: { appId: 1, updateTime: -1, _id: -1 },
        options: {}
      })
    ).resolves.toBe(true);

    const fullAndUnique = mockClient({
      indexes: [
        {
          name: 'appId_1_updateTime_-1__id_-1',
          key: { appId: 1, updateTime: -1, _id: -1 }
        },
        {
          name: 'userId_1_teamId_1',
          key: { userId: 1, teamId: 1 },
          unique: true
        }
      ]
    });
    await expect(
      hasMatchingMongoIndex({
        client: fullAndUnique,
        collectionName: 'chats',
        key: { appId: 1, updateTime: -1, _id: -1 },
        options: {}
      })
    ).resolves.toBe(true);
    await expect(
      hasMatchingMongoIndex({
        client: fullAndUnique,
        collectionName: 'team_members',
        key: { userId: 1, teamId: 1 },
        options: { unique: true }
      })
    ).resolves.toBe(true);
    await expect(
      hasMatchingMongoIndex({
        client: fullAndUnique,
        collectionName: 'team_members',
        key: { userId: 1, teamId: 1 },
        options: {}
      })
    ).resolves.toBe(false);
  });

  it('rejects in-progress building and hidden indexes on real MongoDB until committed and visible', async () => {
    const { MongoMemoryReplSet } = await import('mongodb-memory-server');
    const { Mongoose } = await import('mongoose');

    const replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
      instanceOpts: [{ args: ['--setParameter', 'enableTestCommands=1'] }]
    });
    const client = new Mongoose();
    try {
      await client.connect(replSet.getUri('fg_idx_ready_real_test'));
      const db = client.connection.db!;
      const col = db.collection('chats_real_ready');
      await col.insertOne({ appId: 'a1', updateTime: new Date() });

      // 1. 真实隐藏索引：listIndexes 已列出，但不可用于查询规划器 -> 必须返回 false；unhide 后返回 true
      await col.createIndex({ hiddenKey: 1 }, { name: 'hidden_idx', hidden: true });
      await expect(
        hasMatchingMongoIndex({
          client,
          collectionName: 'chats_real_ready',
          key: { hiddenKey: 1 },
          options: {}
        })
      ).resolves.toBe(false);
      await db.command({
        collMod: 'chats_real_ready',
        index: { name: 'hidden_idx', hidden: false }
      });
      await expect(
        hasMatchingMongoIndex({
          client,
          collectionName: 'chats_real_ready',
          key: { hiddenKey: 1 },
          options: {}
        })
      ).resolves.toBe(true);

      // 2. 真实冻结构建中的索引：listIndexes 已返回该定义，但尚未提交可用 -> 必须返回 false；提交后返回 true
      await db
        .admin()
        .command({ configureFailPoint: 'hangAfterStartingIndexBuild', mode: 'alwaysOn' });
      const buildPromise = col.createIndex(
        { appId: 1, updateTime: -1, _id: -1 },
        { name: 'appId_1_updateTime_-1__id_-1' }
      );
      try {
        // 等待后台构建登记进 listIndexes，实证复现 MongoDB 8.x 会列出构建中索引的现象
        const deadline = Date.now() + 5_000;
        let listedWhileBuilding = false;
        while (Date.now() < deadline) {
          const names = (await col.indexes()).map((item) => item.name);
          if (names.includes('appId_1_updateTime_-1__id_-1')) {
            listedWhileBuilding = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        expect(listedWhileBuilding).toBe(true);

        // 即使 listIndexes 已列出，hasMatchingMongoIndex 仍必须判为未就绪
        await expect(
          hasMatchingMongoIndex({
            client,
            collectionName: 'chats_real_ready',
            key: { appId: 1, updateTime: -1, _id: -1 },
            options: {}
          })
        ).resolves.toBe(false);
      } finally {
        await db
          .admin()
          .command({ configureFailPoint: 'hangAfterStartingIndexBuild', mode: 'off' });
      }

      await buildPromise;
      await expect(
        hasMatchingMongoIndex({
          client,
          collectionName: 'chats_real_ready',
          key: { appId: 1, updateTime: -1, _id: -1 },
          options: {}
        })
      ).resolves.toBe(true);
    } finally {
      await client.disconnect().catch(() => undefined);
      await replSet.stop();
    }
  });
});
