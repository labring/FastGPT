import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client } from 'pg';

// 必须显式指定本机隔离实例；不会读取普通 PG_URL 或对生产表建索引、写测试向量。
const target = vi.hoisted(() => {
  const address = process.env.FASTGPT_PG_INDEX_TEST_URL;
  if (!address) return undefined;
  const url = new URL(address);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('Dataset index integration tests require an explicit local PG instance');
  }
  const schema = `fastgpt_fp16_test_${process.pid}`;
  url.searchParams.set('options', `-csearch_path=${schema},public`);
  return { address, schema, connectionString: url.toString() };
});
vi.unmock('@fastgpt/service/common/vectorDB/pg');
vi.mock('@fastgpt/service/common/vectorDB/constants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  PG_ADDRESS: target?.connectionString,
  DatasetVectorTableName: 'modeldata'
}));

import { PgVectorCtrl } from '@fastgpt/service/common/vectorDB/pg';
import {
  ensurePgDatasetIndex,
  getPgDatasetIndexName
} from '@fastgpt/service/common/vectorDB/pg/datasetIndex';
import { buildPgVectorRecallQuery } from '@fastgpt/service/common/vectorDB/pg/utils';
import { connectPg } from '@fastgpt/service/common/vectorDB/pg/controller';

const describeStorage = describe.skipIf(!target).each(['vector', 'halfvec']);
describeStorage('local PG FP16 dataset index with %s storage', (storage) => {
  const teamId = '507f1f77bcf86cd799439011';
  const datasetId = '507f1f77bcf86cd799439012';
  const repairId = '507f1f77bcf86cd799439013';
  const smallIds = ['507f1f77bcf86cd799439014', '507f1f77bcf86cd799439015'];
  const dimensions = Number(process.env.FASTGPT_PG_INDEX_TEST_DIMENSIONS || 16);
  const ctrl = new PgVectorCtrl();
  const admin = new Client({ connectionString: target?.address });
  // 查询值不能被 FP16 精确表示，确保 FP32 重排不会误用已量化的查询向量。
  const vector = [1.0001, ...Array.from({ length: dimensions - 1 }, () => 0)];
  const callbacks = { onBuilding: vi.fn(async () => {}), onProgress: vi.fn() };
  const topScores =
    storage === 'halfvec' ? [1.125, 1.25, 1.375, 1.5] : [1.0001, 1.0002, 1.0003, 1.0004];
  const scoreFor = (value: number) => Math.fround(Math.fround(value) * Math.fround(vector[0]));

  beforeAll(async () => {
    await admin.connect();
    await admin.query('CREATE EXTENSION IF NOT EXISTS vector');
    await admin.query(`CREATE SCHEMA ${target!.schema}`);
    const pool = await connectPg();
    await pool.query(`CREATE TABLE modeldata (
      id bigserial PRIMARY KEY, team_id varchar(50), dataset_id varchar(50), collection_id varchar(50),
      vector ${storage}(${dimensions}), createtime timestamp DEFAULT now()
    )`);
    await ctrl.init();
    // vector 样本核验 FP16 相同候选仍按 FP32 区分；halfvec 样本使用可精确表示的分数。
    // 背景向量按维度缩放，保持不同维度下的范数范围，避免召回断言依赖随机建图。
    for (const id of [datasetId, repairId]) {
      await pool.query(
        `INSERT INTO modeldata (team_id, dataset_id, collection_id, vector)
        SELECT $1, $2, 'allowed', ARRAY(
          SELECT (sin(g::float8 * d) * 0.1 / sqrt(${dimensions}))::real
          FROM generate_series(1, ${dimensions}) d
        )::vector FROM generate_series(1, 30001) g`,
        [teamId, id]
      );
    }
    for (const [id, score, collection] of [
      [datasetId, topScores[0], 'allowed'],
      [datasetId, topScores[1], 'allowed'],
      [datasetId, 2, 'hidden'],
      [smallIds[0], topScores[2], 'allowed'],
      [smallIds[1], topScores[3], 'allowed']
    ] as const) {
      await pool.query(
        'INSERT INTO modeldata (team_id, dataset_id, collection_id, vector) VALUES ($1,$2,$3,$4)',
        [teamId, id, collection, `[${[score, ...vector.slice(1)].join(',')}]`]
      );
    }
    if (storage === 'vector') {
      await pool.query(
        "INSERT INTO modeldata (team_id, dataset_id, collection_id, vector) VALUES ($1,$2,'poison',$3)",
        [teamId, repairId, `[${[1000000, ...vector.slice(1)].join(',')}]`]
      );
    }
    // 即使 datasetId 相同，其他团队也不允许进入候选。
    await pool.query(
      'INSERT INTO modeldata (team_id, dataset_id, collection_id, vector) VALUES ($1,$2,$3,$4)',
      ['507f1f77bcf86cd799439099', datasetId, 'allowed', `[${[10, ...vector.slice(1)].join(',')}]`]
    );
    await pool.query('VACUUM ANALYZE modeldata');
  }, 240000);

  afterAll(async () => {
    if (global.pgClient) {
      await global.pgClient.end();
      global.pgClient = null;
    }
    await admin.query(`DROP SCHEMA IF EXISTS ${target!.schema} CASCADE`);
    await admin.end();
  });

  it('preserves storage and initializes ordinary indexes without a global HNSW', async () => {
    const { rows: columns } = await (
      await connectPg()
    ).query(
      "SELECT format_type(atttypid, atttypmod) AS type FROM pg_attribute WHERE attrelid = 'modeldata'::regclass AND attname = 'vector'"
    );
    expect(columns[0].type).toBe(`${storage}(${dimensions})`);
    const { rows } = await (
      await connectPg()
    ).query('SELECT indexname FROM pg_indexes WHERE schemaname = $1', [target!.schema]);
    expect(rows.map((row) => row.indexname)).not.toContain('vector_index');
    expect(rows.map((row) => row.indexname)).toContain('team_dataset_collection_index');
  });

  it('keeps legacy global indexes and queries existing data before the local index is ready', async () => {
    const pool = await connectPg();
    await pool.query(
      `CREATE INDEX CONCURRENTLY vector_index ON modeldata USING hnsw
       (vector ${storage === 'halfvec' ? 'halfvec_ip_ops' : 'vector_ip_ops'})
       WITH (m = 32, ef_construction = 128)`
    );
    await ctrl.init();
    const { rows } = await pool.query("SELECT to_regclass('vector_index') IS NOT NULL AS exists");
    expect(rows[0].exists).toBe(true);

    for (const pgIndex of [undefined, 'pending', 'building', 'failed'] as const) {
      const props = {
        teamId,
        datasetIds: [datasetId, ...smallIds],
        vector,
        limit: 3,
        forbidCollectionIdList: ['hidden'],
        datasetVectorData: pgIndex ? [{ datasetId, rows: 30004, pgIndex }] : undefined
      };
      const query = buildPgVectorRecallQuery(props)!;
      expect(query.usesHnsw).toBe(false);
      const plan = await pool.query(`EXPLAIN (FORMAT JSON) ${query.text}`, query.values);
      expect(JSON.stringify(plan.rows)).not.toContain('vector_index');
      const result = await ctrl.embRecall(props);
      expect(result.results.map(({ score }) => score)).toEqual(
        [topScores[3], topScores[2], topScores[1]].map(scoreFor)
      );
      expect(result.results.every(({ collectionId }) => collectionId === 'allowed')).toBe(true);
    }
  }, 240000);

  it('creates a valid FP16 partial index and skips a second build', async () => {
    expect(await ensurePgDatasetIndex({ teamId, datasetId, ...callbacks })).toEqual({
      pgIndex: 'ready',
      created: true
    });
    expect(await ensurePgDatasetIndex({ teamId, datasetId, ...callbacks })).toEqual({
      pgIndex: 'ready',
      created: false
    });
    expect(callbacks.onBuilding).toHaveBeenCalledOnce();
  }, 240000);

  it('queries while legacy and local indexes coexist, then removes the legacy test index', async () => {
    const result = await ctrl.embRecall({
      teamId,
      datasetIds: [datasetId, ...smallIds],
      vector,
      limit: 100,
      forbidCollectionIdList: ['hidden'],
      datasetVectorData: [{ datasetId, rows: 30004, pgIndex: 'ready' }]
    });
    expect(result.results).toHaveLength(100);
    expect(result.results.every(({ collectionId }) => collectionId === 'allowed')).toBe(true);
    expect(result.results.every(({ score }, i, all) => i === 0 || all[i - 1].score >= score)).toBe(
      true
    );
    // halfvec 列的旧全局与局部索引表达式相同，优化器可能选择任意一个。
    // 仅清理本测试 schema 的旧索引，后续用例验证完成清理后的局部索引路径。
    await (await connectPg()).query('DROP INDEX CONCURRENTLY vector_index');
  });

  it('hits the local HNSW and merges exact small datasets by FP32 distance with permissions', async () => {
    const props = {
      teamId,
      datasetIds: [datasetId, ...smallIds],
      vector,
      limit: 3,
      forbidCollectionIdList: ['hidden'],
      datasetVectorData: [{ datasetId, rows: 30004, pgIndex: 'ready' as const }]
    };
    const query = buildPgVectorRecallQuery(props)!;
    const plan = await (
      await connectPg()
    ).query(`EXPLAIN (FORMAT JSON) ${query.text}`, query.values);
    expect(JSON.stringify(plan.rows)).toContain(getPgDatasetIndexName(datasetId));
    const result = await ctrl.embRecall(props);
    expect(result.results).toHaveLength(3);
    const scores = result.results.map((row) => row.score);
    expect(scores).toEqual([topScores[3], topScores[2], topScores[1]].map(scoreFor));
    expect(result.results.every((row) => row.collectionId === 'allowed')).toBe(true);

    const exact = await ctrl.embRecall({ ...props, datasetVectorData: [] });
    expect(result.results).toEqual(exact.results);
    expect((await ctrl.embRecall({ ...props, limit: 100 })).results).toHaveLength(100);
    await expect(ctrl.embRecall({ ...props, filterCollectionIdList: ['hidden'] })).resolves.toEqual(
      { results: [] }
    );
  });

  it('inserts, refreshes, counts and deletes vectors with a local index present', async () => {
    const scope = { teamId, datasetId };
    const count = await ctrl.getVectorCount(scope);
    const { insertIds } = await ctrl.insert({
      ...scope,
      collectionId: 'allowed',
      vectors: [[3, ...vector.slice(1)]]
    });
    try {
      expect(await ctrl.getVectorCount(scope)).toBe(count + 1);
      const props = {
        ...scope,
        datasetIds: [datasetId],
        vector,
        limit: 3,
        forbidCollectionIdList: ['hidden'],
        datasetVectorData: [{ datasetId, rows: count + 1, pgIndex: 'ready' as const }]
      };
      const indexed = await ctrl.embRecall(props);
      expect(indexed.results[0]).toEqual({
        id: insertIds[0],
        collectionId: 'allowed',
        score: scoreFor(3)
      });
      expect(indexed.results).toEqual(
        (await ctrl.embRecall({ ...props, datasetVectorData: [] })).results
      );
      await (
        await connectPg()
      ).query("UPDATE modeldata SET createtime = '2000-01-01' WHERE id = $1", [insertIds[0]]);
      await ctrl.refreshCreateTime({ teamId, idList: insertIds });
      const { rows } = await (
        await connectPg()
      ).query(
        "SELECT createtime > '2000-01-01'::timestamp AS refreshed FROM modeldata WHERE id = $1",
        [insertIds[0]]
      );
      expect(rows[0].refreshed).toBe(true);
    } finally {
      await ctrl.delete({ teamId, idList: insertIds });
    }
    expect(await ctrl.getVectorCount(scope)).toBe(count);
  });

  it('keeps one database build globally even if an old worker still owns the session lock', async () => {
    await admin.query('SELECT pg_advisory_lock(41823001)');
    try {
      await expect(
        ensurePgDatasetIndex({ teamId, datasetId: repairId, ...callbacks })
      ).rejects.toThrow('still running');
    } finally {
      await admin.query('SELECT pg_advisory_unlock(41823001)');
    }
  });

  it.skipIf(storage !== 'vector')(
    'repairs an invalid index left by a failed concurrent build after bad data is removed',
    async () => {
      await expect(
        ensurePgDatasetIndex({ teamId, datasetId: repairId, ...callbacks })
      ).rejects.toThrow();
      const pool = await connectPg();
      const invalid = await pool.query(
        'SELECT indisvalid FROM pg_index WHERE indexrelid = to_regclass($1)',
        [getPgDatasetIndexName(repairId)]
      );
      expect(invalid.rows[0].indisvalid).toBe(false);
      await pool.query("DELETE FROM modeldata WHERE dataset_id = $1 AND collection_id = 'poison'", [
        repairId
      ]);
      expect(await ensurePgDatasetIndex({ teamId, datasetId: repairId, ...callbacks })).toEqual({
        pgIndex: 'ready',
        created: true
      });
    },
    240000
  );
  it.skipIf(!process.env.FASTGPT_PG_INDEX_BENCHMARK || storage !== 'vector')(
    'reports warm vector-stage latency for the same 100 queries',
    async () => {
      const { rows } = await (
        await connectPg()
      ).query(
        "SELECT vector::text AS vector FROM modeldata WHERE team_id = $1 AND dataset_id = $2 AND collection_id = 'allowed' LIMIT 100 OFFSET 100",
        [teamId, datasetId]
      );
      const queries = rows.map((row) => JSON.parse(row.vector) as number[]);
      const run = async (indexed: boolean, concurrency: number) => {
        const latencies: number[] = [];
        const resultIds: string[][] = new Array(queries.length);
        let next = 0;
        const started = performance.now();
        await Promise.all(
          Array.from({ length: concurrency }, async () => {
            while (next < queries.length) {
              const index = next++;
              const query = queries[index];
              const start = performance.now();
              const result = await ctrl.embRecall({
                teamId,
                datasetIds: [datasetId, ...smallIds],
                vector: query,
                limit: 100,
                forbidCollectionIdList: ['hidden'],
                datasetVectorData: indexed ? [{ datasetId, rows: 30004, pgIndex: 'ready' }] : []
              });
              latencies.push(performance.now() - start);
              resultIds[index] = result.results.map((item) => item.id);
              expect(result.results).toHaveLength(100);
            }
          })
        );
        latencies.sort((a, b) => a - b);
        const wallMs = performance.now() - started;
        return {
          resultIds,
          indexed,
          concurrency,
          queries: queries.length,
          avgMs: Math.round((latencies.reduce((a, b) => a + b, 0) / latencies.length) * 10) / 10,
          p95Ms: Math.round(latencies[Math.ceil(latencies.length * 0.95) - 1] * 10) / 10,
          qps: Math.round((queries.length / wallMs) * 10000) / 10
        };
      };
      const measurements = [
        await run(false, 1),
        await run(true, 1),
        await run(false, 20),
        await run(true, 20)
      ];
      const groundTruth = measurements[0].resultIds.map((ids) => new Set(ids));
      console.log(
        'FP16 routing local microbenchmark (synthetic vectors; excludes Mongo/Redis/embedding)',
        {
          dimensions,
          results: measurements.map(({ resultIds, ...metrics }) => ({
            ...metrics,
            recallAt100:
              resultIds.reduce(
                (sum, ids, index) => sum + ids.filter((id) => groundTruth[index].has(id)).length,
                0
              ) /
              (100 * resultIds.length)
          }))
        }
      );
    },
    240000
  );
});
