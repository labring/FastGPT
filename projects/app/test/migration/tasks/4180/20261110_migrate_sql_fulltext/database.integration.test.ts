import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { Client, Pool } from 'pg';
import { createMysqlFullTextTestTarget } from '@fastgpt/service/test/integrations/vectorDB/fullText/client';
import type { SqlFullTextProvider } from '@fastgpt/global/core/dataset/fullText/schema';

// 明确 opt-in；绝不读取 PG_URL 等业务连接，也不在已有业务表上创建测试数据。
const target = vi.hoisted(() => {
  const provider = process.env.FASTGPT_SQL_FULLTEXT_TEST_PROVIDER;
  const address = process.env.FASTGPT_SQL_FULLTEXT_TEST_URL;
  if (!provider && !address) return;
  if (!provider || !address || !['pg', 'oceanbase', 'seekdb', 'opengauss'].includes(provider))
    throw new Error('Specify a supported SQL full-text provider and its isolated test URL');
  const url = new URL(address);
  if (
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !url.pathname.startsWith('/fulltext_test')
  )
    throw new Error(
      'SQL migration integration tests require an explicit local fulltext_test database'
    );
  const isMysql = provider === 'oceanbase' || provider === 'seekdb';
  if (
    !(
      (isMysql && url.protocol === 'mysql:') ||
      (!isMysql && ['postgres:', 'postgresql:'].includes(url.protocol))
    )
  )
    throw new Error('Test URL protocol does not match the configured provider');
  return {
    provider: provider as SqlFullTextProvider,
    address,
    isMysql,
    name: `fulltext_test_${provider}_${process.pid}_${Date.now()}`
  };
});
vi.unmock('@fastgpt/service/common/vectorDB/pg');
vi.unmock('@fastgpt/service/common/vectorDB/oceanbase');
vi.unmock('@fastgpt/service/common/vectorDB/seekdb');
vi.unmock('@fastgpt/service/common/vectorDB/opengauss');
vi.unmock('@fastgpt/service/common/mongo/sessionRun');
vi.mock('@fastgpt/service/common/vectorDB/constants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getVectorType: () => target?.provider ?? 'pg',
  PG_ADDRESS: target?.provider === 'pg' ? target.address : undefined,
  OCEANBASE_ADDRESS: target?.provider === 'oceanbase' ? target.address : undefined,
  SEEKDB_ADDRESS: target?.provider === 'seekdb' ? target.address : undefined,
  OPENGAUSS_ADDRESS: target?.provider === 'opengauss' ? target.address : undefined
}));

import { initVectorStore } from '@fastgpt/service/common/vectorDB/controller';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { getFullTextStore } from '@fastgpt/service/core/dataset/data/textStore';
import { getSqlFullTextAdapter } from '@fastgpt/service/common/vectorDB/fullText/controller';
import { systemMigrations } from '@/migration/registry';
import { createSystemMigrationRunner } from '@/migration/runner';
import {
  enqueueManualMigration,
  ensureMigrationStates,
  resetFailedMigration
} from '@/migration/entity';
import { MongoSystemMigrationState } from '@/migration/mongoSchema';
import { DatasetDataOperation } from '@/service/core/dataset/data/data';
import type { EmbeddingModelDataType } from '@fastgpt/global/core/ai/model/schema';
import {
  refreshSqlFullTextTargetReady,
  startSqlFullTextReadiness
} from '@fastgpt/service/core/dataset/fullText/sql/readiness';

// 保留真实配置逻辑，用 getter 模拟不同部署进程的环境，无需重启测试宿主。
const env = vi.hoisted(() => ({ compatibility: true }));
vi.mock('@fastgpt/service/env', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt/service/env')>();
  return {
    ...original,
    serviceEnv: {
      ...original.serviceEnv,
      get TMP_MIGRATE_FULL_TEXT() {
        return env.compatibility;
      }
    }
  };
});

const model = {
  modelId: '68ad85a7463006c963799a05',
  model: 'text-embedding-3-small',
  type: 'embedding',
  config: { defaultToken: 512, maxToken: 512, weight: 100 }
} as EmbeddingModelDataType;

const deferred = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

describe.skipIf(!target)('selected SQL database real full-text migration', () => {
  const teamId = new Types.ObjectId().toString();
  const datasetId = new Types.ObjectId().toString();
  const collectionId = new Types.ObjectId().toString();
  const vector = Array.from({ length: 1536 }, (_, i) => Number(i === 0));
  let pgPool: Pool | undefined;
  let pgAdmin: Client | undefined;
  let mysqlTarget: Awaited<ReturnType<typeof createMysqlFullTextTestTarget>> | undefined;
  let previousPg: typeof global.pgClient;
  let previousMysql: typeof global.obClient;
  let created = false;
  const reachedCommit = deferred();
  const continueCommit = deferred();
  const runner = createSystemMigrationRunner({
    migrations: systemMigrations
      .filter((m) => m.id === '20261110_migrate_sql_fulltext')
      .map((migration) => ({
        ...migration,
        run: async (context) => {
          const result = await migration.run(context);
          reachedCommit.release();
          await continueCommit.promise;
          return result;
        }
      }))
  });
  const query = async (sql: string, values?: unknown[]) => {
    if (mysqlTarget) return mysqlTarget.query(sql, values);
    return (await pgPool!.query(sql, values)).rows;
  };
  const insertLegacyVector = async () => {
    const vectorLiteral = `[${vector.join(',')}]`;
    if (target!.isMysql) {
      await query(
        'INSERT INTO modeldata (vector, team_id, dataset_id, collection_id) VALUES (?, ?, ?, ?)',
        [vectorLiteral, teamId, datasetId, collectionId]
      );
      const rows = await query('SELECT CAST(LAST_INSERT_ID() AS CHAR) AS id');
      return String((rows as Array<{ id: string }>)[0].id);
    }
    const rows = await query(
      'INSERT INTO modeldata (vector, team_id, dataset_id, collection_id) VALUES ($1, $2, $3, $4) RETURNING id::text AS id',
      [vectorLiteral, teamId, datasetId, collectionId]
    );
    return String((rows as Array<{ id: string }>)[0].id);
  };
  const props = (text: string) => ({
    teamId,
    datasetIds: [datasetId],
    query: text,
    limit: 10,
    forbidCollectionIdList: [] as string[]
  });
  const snapshot = () =>
    query(
      'SELECT id,vector,team_id,dataset_id,collection_id,createtime FROM modeldata ORDER BY id'
    );

  beforeAll(async () => {
    previousPg = global.pgClient;
    previousMysql = global.obClient;
    if (target!.isMysql) {
      mysqlTarget = await createMysqlFullTextTestTarget(target!.address, target!.name);
      global.obClient = mysqlTarget.pool;
    } else {
      pgAdmin = new Client({ connectionString: target!.address });
      await pgAdmin.connect();
      if (target!.provider === 'pg') await pgAdmin.query('CREATE EXTENSION IF NOT EXISTS vector');
      await pgAdmin.query(`CREATE SCHEMA ${target!.name}`);
      created = true;
      pgPool = new Pool({
        connectionString: target!.address,
        options: `-csearch_path=${target!.name},public`,
        max: 4
      });
      global.pgClient = pgPool;
    }
    // 严格按升级前存量 modeldata 表定义创建旧表（不含 fulltext_tokens 列）。
    await query(`CREATE TABLE modeldata (id ${target!.isMysql ? 'BIGINT AUTO_INCREMENT' : 'BIGSERIAL'} PRIMARY KEY,
      vector VECTOR(1536) NOT NULL,team_id VARCHAR(50) NOT NULL,dataset_id VARCHAR(50) NOT NULL,
      collection_id VARCHAR(50) NOT NULL,createtime TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  });
  afterAll(async () => {
    runner.stop();
    global.pgClient = previousPg;
    global.obClient = previousMysql;
    await pgPool?.end();
    await mysqlTarget?.close();
    if (created) {
      if (pgAdmin) await pgAdmin.query(`DROP SCHEMA ${target!.name} CASCADE`);
    }
    await pgAdmin?.end();
  });

  it('keeps Mongo reads and dual writes through a paused migration and switches reads and writes only after flag removal', async () => {
    const examples = [
      ['南京市长江大桥通行指南', '长江大桥'],
      ['FastGPT authentication token', 'authentication'],
      ['数据库向量检索迁移说明', '向量']
    ];
    const fixtures = [];
    for (const [text, search] of examples) {
      const vectorId = await insertLegacyVector();
      const data = await MongoDatasetData.create({
        teamId,
        datasetId,
        collectionId,
        tmbId: new Types.ObjectId(),
        synonymVersion: 0,
        q: text,
        a: '',
        indexes: [{ dataId: vectorId, text, type: 'custom' }]
      });
      await MongoDatasetDataText.create({
        teamId,
        datasetId,
        collectionId,
        dataId: data._id,
        fullTextToken: `${text} legacyonlyproof`
      });
      fixtures.push({ id: String(data._id), search });
    }
    const before = await snapshot();
    const source = await MongoDatasetData.find().sort({ _id: 1 }).lean();
    expect(await MongoDatasetDataText.countDocuments()).toBe(3);
    const operation = new DatasetDataOperation(model);
    const store = getFullTextStore();
    const hits = async (term: string) =>
      (await store.search(props(term))).map(({ dataId }) => dataId);
    const adapter = getSqlFullTextAdapter();
    await initVectorStore();

    await ensureMigrationStates(
      systemMigrations.filter((m) => m.id === '20261110_migrate_sql_fulltext')
    );
    await runner.tick();
    expect(await MongoSystemMigrationState.findById('20261110_migrate_sql_fulltext')).toMatchObject(
      { status: 'waiting' }
    );
    expect(await hits('legacyonlyproof')).toEqual(
      expect.arrayContaining(fixtures.map(({ id }) => id))
    );

    const reachedScan = deferred();
    const continueScan = deferred();
    const fill = adapter.fill.bind(adapter);
    const pause = vi.spyOn(adapter, 'fill').mockImplementationOnce(async (...args) => {
      reachedScan.release();
      await continueScan.promise;
      return fill(...args);
    });
    // 故意让一个固定搜索断言失败，实际 SQL 仍执行。必须阻断成功终态，且兼容读取继续可用。
    const search = adapter.search.bind(adapter);
    const probeFailure = vi.spyOn(adapter, 'search').mockImplementation(async (input) => {
      const result = await search(input);
      return input.query === '数据库' ? [] : result;
    });
    await enqueueManualMigration('20261110_migrate_sql_fulltext');
    const running = runner.tick();
    let concurrentId: string;
    try {
      await Promise.race([
        reachedScan.promise,
        running.then(() => {
          throw new Error('Migration did not reach the scan gate');
        })
      ]);
      expect(
        await MongoSystemMigrationState.findById('20261110_migrate_sql_fulltext')
      ).toMatchObject({
        status: 'running',
        progress: expect.arrayContaining([
          expect.objectContaining({ key: 'scan', status: 'running' })
        ])
      });
      const during = await operation.create({
        teamId,
        datasetId,
        collectionId,
        tmbId: new Types.ObjectId().toString(),
        q: "中英并发写入 concurrentproof O'Reilly",
        a: '',
        embeddingModel: model
      });
      concurrentId = String(during.insertId);
      expect(await hits('concurrentproof')).toEqual([concurrentId]);
      expect(await MongoDatasetDataText.findOne({ dataId: concurrentId }).lean()).toBeTruthy();
      expect(
        await query("SELECT id FROM modeldata WHERE fulltext_tokens LIKE '%concurrentproof%'")
      ).toHaveLength(1);
      env.compatibility = false;
      expect(await refreshSqlFullTextTargetReady()).toBe(false);
      await expect(hits('legacyonlyproof')).rejects.toThrow('not ready');
      // 模拟未配置兼容变量的节点启动。它的后台检查在成功提交前必须保持关闭。
      startSqlFullTextReadiness();
      env.compatibility = true;
    } finally {
      continueScan.release();
      await running;
      pause.mockRestore();
      probeFailure.mockRestore();
    }
    expect(
      await MongoSystemMigrationState.findById('20261110_migrate_sql_fulltext').lean()
    ).toMatchObject({
      status: 'failed',
      lastError: { stageKey: 'validation', message: expect.stringContaining('smoke test failed') }
    });
    expect(await hits('concurrentproof')).toEqual([concurrentId]);
    expect(await resetFailedMigration('20261110_migrate_sql_fulltext')).toBe(true);
    const retrying = runner.tick();
    try {
      await Promise.race([
        reachedCommit.promise,
        retrying.then(() => {
          throw new Error('Migration retry did not reach the success commit gate');
        })
      ]);
      // 完整验收已经写入目标记录，但 Runner 仍未持久化 succeeded，原生读取继续拒绝。
      env.compatibility = false;
      expect(await refreshSqlFullTextTargetReady()).toBe(false);
      await expect(hits('concurrentproof')).rejects.toThrow('not ready');
      env.compatibility = true;
      expect(await hits('concurrentproof')).toEqual([concurrentId]);
    } finally {
      continueCommit.release();
      await retrying;
    }
    expect(
      await MongoSystemMigrationState.findById('20261110_migrate_sql_fulltext').lean()
    ).toMatchObject({
      status: 'succeeded',
      result: {
        applicable: true,
        provider: target!.provider,
        schemaVersion: 1,
        scanned: 3,
        validated: 4
      }
    });
    expect(await snapshot()).toHaveLength(4);
    expect((await snapshot()).slice(0, 3)).toEqual(before);
    expect(
      await MongoDatasetData.find({ _id: { $in: source.map(({ _id }) => _id) } })
        .sort({ _id: 1 })
        .lean()
    ).toEqual(source);
    expect(await MongoDatasetDataText.countDocuments()).toBe(4);
    expect(await hits('legacyonlyproof')).toHaveLength(3);
    expect(await hits('concurrentproof')).toEqual([concurrentId]);
    const compatibilityWrite = await operation.create({
      teamId,
      datasetId,
      collectionId,
      tmbId: new Types.ObjectId().toString(),
      q: '验收后仍双写 compatibilityproof',
      a: '',
      embeddingModel: model
    });
    expect(
      await MongoDatasetDataText.findOne({ dataId: compatibilityWrite.insertId }).lean()
    ).toBeTruthy();
    expect(await hits('compatibilityproof')).toEqual([String(compatibilityWrite.insertId)]);

    // 确认 Mongo 是已验收后的主读源，随后模拟移除变量并等待后台刷新。
    env.compatibility = false;
    await expect
      .poll(() => hits('concurrentproof').catch(() => []), { timeout: 12_000 })
      .toEqual([concurrentId]);
    const metadataReads = vi.spyOn(adapter, 'getMetadata');
    expect(await hits('legacyonlyproof')).toEqual([]);
    for (const fixture of fixtures) expect(await hits(fixture.search)).toContain(fixture.id);
    expect(
      await store.search({ ...props('concurrentproof'), forbidCollectionIdList: [collectionId] })
    ).toEqual([]);
    expect(
      await store.search({ ...props('concurrentproof'), filterCollectionIdList: [collectionId] })
    ).toHaveLength(1);
    expect(
      await store.search({ ...props('concurrentproof'), teamId: new Types.ObjectId().toString() })
    ).toEqual([]);
    expect(metadataReads).not.toHaveBeenCalled();
    metadataReads.mockRestore();

    const created = await operation.create({
      teamId,
      datasetId,
      collectionId,
      tmbId: new Types.ObjectId().toString(),
      q: '原生新增 nativecreateproof',
      a: '',
      embeddingModel: model
    });
    expect(await MongoDatasetDataText.exists({ dataId: created.insertId })).toBeNull();
    expect(await hits('nativecreateproof')).toEqual([String(created.insertId)]);
    await operation.updateByIndexes({
      dataId: created.insertId,
      q: '原生更新 nativeupdateproof',
      a: '',
      indexes: [],
      model
    });
    expect(await hits('nativecreateproof')).toEqual([]);
    expect(await hits('nativeupdateproof')).toEqual([String(created.insertId)]);
    const current = (await MongoDatasetData.findById(created.insertId).lean())!;
    await operation.delete({ ...current, id: String(created.insertId) });
    expect(await hits('nativeupdateproof')).toEqual([]);
    expect(await MongoDatasetDataText.countDocuments()).toBe(5);
    expect(
      await query("SELECT id FROM modeldata WHERE fulltext_tokens LIKE '%nativeupdateproof%'")
    ).toEqual([]);
  }, 120000);
});
