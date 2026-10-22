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

describe.skipIf(!target)('local PG FP16 dataset index', () => {
  const teamId = '507f1f77bcf86cd799439011';
  const datasetId = '507f1f77bcf86cd799439012';
  const repairId = '507f1f77bcf86cd799439013';
  const smallIds = ['507f1f77bcf86cd799439014', '507f1f77bcf86cd799439015'];
  const dimensions = Number(process.env.FASTGPT_PG_INDEX_TEST_DIMENSIONS || 16);
  const ctrl = new PgVectorCtrl();
  const admin = new Client({ connectionString: target?.address });
  const vector = [1, ...Array.from({ length: dimensions - 1 }, () => 0)];
  const callbacks = { onBuilding: vi.fn(async () => {}), onProgress: vi.fn() };

  beforeAll(async () => {
    await admin.connect();
    await admin.query('CREATE EXTENSION IF NOT EXISTS vector');
    await admin.query(`CREATE SCHEMA ${target!.schema}`);
    const pool = await connectPg();
    await pool.query(`CREATE TABLE modeldata (
      id bigserial PRIMARY KEY, team_id varchar(50), dataset_id varchar(50), collection_id varchar(50),
      vector vector(${dimensions}), createtime timestamp DEFAULT now()
    )`);
    await ctrl.init();
    // 数据分布不与查询向量相同；最高分样本用于核验 FP16 相同值仍按 FP32 区分排序。
    for (const id of [datasetId, repairId]) {
      await pool.query(
        `INSERT INTO modeldata (team_id, dataset_id, collection_id, vector)
        SELECT $1, $2, 'allowed', ARRAY(
          SELECT (sin(g::float8 * d) * 0.1)::real FROM generate_series(1, ${dimensions}) d
        )::vector FROM generate_series(1, 30001) g`,
        [teamId, id]
      );
    }
    for (const [id, score, collection] of [
      [datasetId, 1.0001, 'allowed'],
      [datasetId, 1.0002, 'allowed'],
      [datasetId, 2, 'hidden'],
      [smallIds[0], 1.0003, 'allowed'],
      [smallIds[1], 1.0004, 'allowed'],
      [repairId, 1000000, 'poison']
    ] as const) {
      await pool.query(
        'INSERT INTO modeldata (team_id, dataset_id, collection_id, vector) VALUES ($1,$2,$3,$4)',
        [teamId, id, collection, `[${[score, ...vector.slice(1)].join(',')}]`]
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

  it('initializes FP32 storage and ordinary indexes without a global HNSW', async () => {
    const { rows } = await (
      await connectPg()
    ).query('SELECT indexname FROM pg_indexes WHERE schemaname = $1', [target!.schema]);
    expect(rows.map((row) => row.indexname)).not.toContain('vector_index');
    expect(rows.map((row) => row.indexname)).toContain('team_dataset_collection_index');
  });

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
    expect(scores[0]).toBeCloseTo(1.0004, 6);
    expect(scores[1]).toBeCloseTo(1.0003, 6);
    expect(scores[2]).toBeCloseTo(1.0002, 6);
    expect(result.results.every((row) => row.collectionId === 'allowed')).toBe(true);

    const exact = await ctrl.embRecall({ ...props, datasetVectorData: [] });
    expect(result.results).toEqual(exact.results);
    await expect(ctrl.embRecall({ ...props, filterCollectionIdList: ['hidden'] })).resolves.toEqual(
      { results: [] }
    );
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

  it('repairs an invalid index left by a failed concurrent build after bad data is removed', async () => {
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
  }, 240000);
  it.skipIf(!process.env.FASTGPT_PG_INDEX_BENCHMARK)(
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
