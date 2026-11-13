import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client, Pool } from 'pg';
import { createMysqlFullTextTestTarget } from '@fastgpt/service/test/integrations/vectorDB/fullText/client';
import type { SqlFullTextProvider } from '@fastgpt/global/core/dataset/fullText/schema';
import type { VectorControllerType } from '@fastgpt/service/common/vectorDB/type';

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

import { PgVectorCtrl } from '@fastgpt/service/common/vectorDB/pg';
import { ObVectorCtrl } from '@fastgpt/service/common/vectorDB/oceanbase';
import { OpenGaussVectorCtrl } from '@fastgpt/service/common/vectorDB/opengauss';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { getFullTextStore } from '@fastgpt/service/core/dataset/data/textStore';
import { getSqlFullTextAdapter } from '@fastgpt/service/common/vectorDB/fullText/controller';
import { systemMigrations } from '@/migration/registry';
import { createSystemMigrationRunner } from '@/migration/runner';
import { enqueueManualMigration, ensureMigrationStates } from '@/migration/entity';
import { MongoSystemMigrationState } from '@/migration/mongoSchema';

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
  let vectorStore: VectorControllerType;
  const runner = createSystemMigrationRunner({
    migrations: systemMigrations.filter((m) => m.id === '20261110_migrate_sql_fulltext')
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
      vectorStore = new ObVectorCtrl({ type: target!.provider as 'oceanbase' | 'seekdb' });
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
      vectorStore = target!.provider === 'pg' ? new PgVectorCtrl() : new OpenGaussVectorCtrl();
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

  it('automatically migrates legacy rows, retains legacy Mongo full-text table, cuts over reads and writes new rows natively', async () => {
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
        fullTextToken: text
      });
      fixtures.push({ id: String(data._id), search });
    }
    const before = await snapshot();
    const source = await MongoDatasetData.find().sort({ _id: 1 }).lean();
    expect(await MongoDatasetDataText.countDocuments()).toBe(3);

    await ensureMigrationStates(
      systemMigrations.filter((m) => m.id === '20261110_migrate_sql_fulltext')
    );
    await enqueueManualMigration('20261110_migrate_sql_fulltext');
    await runner.tick();
    expect(
      await MongoSystemMigrationState.findById('20261110_migrate_sql_fulltext').lean()
    ).toMatchObject({
      status: 'succeeded',
      result: {
        applicable: true,
        provider: target!.provider,
        prechecked: 3,
        scanned: 3,
        validated: 3
      }
    });
    expect(await snapshot()).toEqual(before);
    expect(await MongoDatasetData.find().sort({ _id: 1 }).lean()).toEqual(source);
    expect(await MongoDatasetDataText.countDocuments()).toBe(3);

    for (const fixture of fixtures) {
      expect((await getFullTextStore().search(props(fixture.search)))[0]?.dataId).toBe(fixture.id);
    }

    const text = "O'Reilly 中文 incrementalproof";
    const inserted = await vectorStore.insert({
      teamId,
      datasetId,
      collectionId,
      vectors: [vector],
      texts: [text]
    });
    const data = await MongoDatasetData.create({
      teamId,
      datasetId,
      collectionId,
      tmbId: new Types.ObjectId(),
      synonymVersion: 0,
      q: text,
      indexes: [{ dataId: inserted.insertIds[0], text, type: 'custom' }]
    });
    expect((await getFullTextStore().search(props('incrementalproof')))[0]?.dataId).toBe(
      String(data._id)
    );
    expect(
      await getSqlFullTextAdapter().fill(
        [{ vectorId: inserted.insertIds[0], teamId, datasetId, collectionId, text }],
        true
      )
    ).toEqual([]);
  }, 120000);
});
