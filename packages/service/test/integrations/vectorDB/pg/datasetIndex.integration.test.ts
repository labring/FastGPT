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
vi.unmock('@fastgpt/service/common/mongo/sessionRun');
vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: () => ({ deleteDatasetFilesByPrefix: vi.fn() })
}));
vi.mock('@fastgpt/service/common/vectorDB/constants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  PG_ADDRESS: target?.connectionString,
  DatasetVectorTableName: 'modeldata',
  getVectorType: () => 'pg'
}));

import { PgVectorCtrl } from '@fastgpt/service/common/vectorDB/pg';
import {
  ensurePgDatasetIndex,
  getPgDatasetIndexName,
  removePgDatasetIndex
} from '@fastgpt/service/common/vectorDB/pg/datasetIndex';
import { buildPgVectorRecallQuery } from '@fastgpt/service/common/vectorDB/pg/utils';
import { connectPg } from '@fastgpt/service/common/vectorDB/pg/controller';
import { datasetDeleteProcessor } from '@fastgpt/service/core/dataset/delete/processor';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';

const describeStorage = describe.skipIf(!target).each(['vector', 'halfvec']);
describeStorage('local PG FP16 dataset index with %s storage', (storage) => {
  const teamId = '507f1f77bcf86cd799439011';
  const datasetId = '507f1f77bcf86cd799439012';
  const repairId = '507f1f77bcf86cd799439013';
  const foreignDatasetId = '507f1f77bcf86cd799439098';
  const smallIds = ['507f1f77bcf86cd799439014', '507f1f77bcf86cd799439015', foreignDatasetId];
  const dimensions = Number(process.env.FASTGPT_PG_INDEX_TEST_DIMENSIONS ?? 16);
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
        )::vector FROM generate_series(1, 10001) g`,
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
    // datasetId 遵循 Mongo _id 全局唯一；未取得本团队路由元数据的外部库留在精确组，由 teamId 排除。
    await pool.query(
      'INSERT INTO modeldata (team_id, dataset_id, collection_id, vector) VALUES ($1,$2,$3,$4)',
      [
        '507f1f77bcf86cd799439099',
        foreignDatasetId,
        'allowed',
        `[${[10, ...vector.slice(1)].join(',')}]`
      ]
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

    // 状态枚举在 SQL 构造器单测覆盖；集成测试验证真实旧索引存在时的精确回退。
    const props = {
      teamId,
      datasetIds: [datasetId, ...smallIds],
      vector,
      limit: 3,
      forbidCollectionIdList: ['hidden'],
      datasetVectorData: [{ datasetId, rows: 10004, pgIndex: 'pending' as const }]
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
    const { rows } = await (
      await connectPg()
    ).query(
      'SELECT pg_get_expr(indpred, indrelid) AS predicate FROM pg_index WHERE indexrelid = to_regclass($1)',
      [getPgDatasetIndexName(datasetId)]
    );
    expect(rows[0].predicate).toContain(datasetId);
    expect(rows[0].predicate).not.toContain('team_id');
  }, 240000);

  it('queries while legacy and local indexes coexist, then removes the legacy test index', async () => {
    const result = await ctrl.embRecall({
      teamId,
      datasetIds: [datasetId, ...smallIds],
      vector,
      limit: 100,
      forbidCollectionIdList: ['hidden'],
      datasetVectorData: [{ datasetId, rows: 10004, pgIndex: 'ready' }]
    });
    expect(result.results).toHaveLength(100);
    expect(result.results.every(({ collectionId }) => collectionId === 'allowed')).toBe(true);
    expect(result.results.every(({ score }, i, all) => i === 0 || all[i - 1].score >= score)).toBe(
      true
    );
    // halfvec 列的旧全局与局部索引表达式相同，优化器可能选择任意一个。
    // 仅清理本测试 schema 的旧索引，后续用例验证完成清理后的局部索引路径。
    await (await connectPg()).query(`DROP INDEX CONCURRENTLY ${target!.schema}.vector_index`);
  });

  it('hits the local HNSW and merges exact small datasets by FP32 distance with permissions', async () => {
    const props = {
      teamId,
      datasetIds: [datasetId, ...smallIds],
      vector,
      limit: 3,
      forbidCollectionIdList: ['hidden'],
      datasetVectorData: [{ datasetId, rows: 10004, pgIndex: 'ready' as const }]
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

  it('keeps one database build globally while another maintenance session owns the lock', async () => {
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

  it('merges multiple HNSW groups and the exact group with one final FP32 ranking', async () => {
    await ensurePgDatasetIndex({ teamId, datasetId: repairId, ...callbacks });
    const props = {
      teamId,
      datasetIds: [datasetId, repairId, ...smallIds],
      vector,
      limit: 3,
      forbidCollectionIdList: ['hidden'],
      datasetVectorData: [datasetId, repairId].map((datasetId) => ({
        datasetId,
        rows: 10001,
        pgIndex: 'ready' as const
      }))
    };
    const query = buildPgVectorRecallQuery(props)!;
    const plan = await (
      await connectPg()
    ).query(`EXPLAIN (FORMAT JSON) ${query.text}`, query.values);
    for (const id of [datasetId, repairId]) {
      expect(JSON.stringify(plan.rows)).toContain(getPgDatasetIndexName(id));
    }
    const indexed = await ctrl.embRecall(props);
    const exact = await ctrl.embRecall({ ...props, datasetVectorData: [] });
    expect(indexed.results).toHaveLength(props.limit);
    expect(indexed.results).toEqual(exact.results);
    expect(indexed.results.map(({ score }) => score)).toEqual(
      [topScores[3], topScores[2], topScores[1]].map(scoreFor)
    );
  }, 240000);

  it('retains at 5000..10000, removes below 5000, and rebuilds only above 10000', async () => {
    const pool = await connectPg();
    const scope = { teamId, datasetId };
    const indexName = getPgDatasetIndexName(datasetId);
    const readIndexOid = async () =>
      (await pool.query('SELECT to_regclass($1)::oid::text AS oid', [indexName])).rows[0].oid;
    // 保留最大 ID，留下高分和权限样本；仅修改本测试 schema 内当前团队的向量。
    const shrinkTo = (rows: number) =>
      pool.query(
        `DELETE FROM modeldata WHERE id IN (
          SELECT id FROM modeldata WHERE team_id=$1 AND dataset_id=$2
          ORDER BY id DESC OFFSET $3
        )`,
        [teamId, datasetId, rows]
      );
    const growTo = async (rows: number) => {
      const count = await ctrl.getVectorCount(scope);
      await pool.query(
        `INSERT INTO modeldata (team_id, dataset_id, collection_id, vector)
         SELECT $1, $2, 'allowed', array_fill(0::real, ARRAY[${dimensions}])::vector
         FROM generate_series(1, $3::int)`,
        [teamId, datasetId, rows - count]
      );
    };
    const recallProps = (rows: number, pgIndex: 'ready' | 'none') => ({
      teamId,
      datasetIds: [datasetId, ...smallIds],
      vector,
      limit: 100,
      forbidCollectionIdList: ['hidden'],
      datasetVectorData: [{ datasetId, rows, pgIndex }]
    });
    const oid = await readIndexOid();
    expect(oid).toBeTruthy();

    for (const rows of [10000, 5000]) {
      await shrinkTo(rows);
      expect(await ensurePgDatasetIndex({ ...scope, ...callbacks })).toEqual({
        pgIndex: 'ready',
        created: false
      });
      expect(await readIndexOid()).toBe(oid);
      const props = recallProps(rows, 'ready');
      const query = buildPgVectorRecallQuery(props)!;
      expect(query.usesHnsw).toBe(true);
      const plan = await pool.query(`EXPLAIN (FORMAT JSON) ${query.text}`, query.values);
      expect(JSON.stringify(plan.rows)).toContain(indexName);
      expect((await ctrl.embRecall(props)).results).toHaveLength(100);
    }

    await shrinkTo(4999);
    const onRemoving = vi.fn(async () => {
      expect(await readIndexOid()).toBe(oid);
    });
    expect(await ensurePgDatasetIndex({ ...scope, ...callbacks, onRemoving })).toEqual({
      pgIndex: 'none',
      created: false
    });
    expect(onRemoving).toHaveBeenCalledOnce();
    expect(await readIndexOid()).toBeNull();
    expect(await ctrl.getVectorCount(scope)).toBe(4999);
    // 维护任务尚未同步元数据时，低行数也必须走精确路径。
    expect(buildPgVectorRecallQuery(recallProps(4999, 'ready'))!.usesHnsw).toBe(false);
    expect((await ctrl.embRecall(recallProps(4999, 'none'))).results).toHaveLength(100);

    for (const rows of [10000, 10001]) {
      await growTo(rows);
      const pgIndex = rows > 10000 ? 'ready' : 'none';
      expect(await ensurePgDatasetIndex({ ...scope, ...callbacks })).toEqual({
        pgIndex,
        created: rows > 10000
      });
      expect((await ctrl.embRecall(recallProps(rows, pgIndex))).results).toHaveLength(100);
    }
    expect(await readIndexOid()).not.toBe(oid);
  }, 240000);

  it.each([false, true])(
    'forces removal before deletion with invalid index=%s without deleting vectors',
    async (invalid) => {
      const pool = await connectPg();
      const scope = { teamId, datasetId };
      await ensurePgDatasetIndex({ ...scope, ...callbacks });
      const indexName = `${target!.schema}.${getPgDatasetIndexName(datasetId)}`;
      const before = await ctrl.getVectorCount(scope);
      expect(before).toBeGreaterThan(10000);
      if (invalid) {
        await pool.query(
          'UPDATE pg_index SET indisvalid=false, indisready=false WHERE indexrelid=to_regclass($1)',
          [indexName]
        );
      }
      await removePgDatasetIndex(scope);
      await removePgDatasetIndex(scope);
      expect(
        (await pool.query('SELECT to_regclass($1) AS index', [indexName])).rows[0].index
      ).toBeNull();
      expect(await ctrl.getVectorCount(scope)).toBe(before);
    },
    240000
  );

  it('waits for an admitted build before dropping it and rejects a stale rebuild afterwards', async () => {
    const pool = await connectPg();
    let release!: () => void;
    let admitted!: () => void;
    const started = new Promise<void>((resolve) => {
      admitted = resolve;
    });
    const pause = new Promise<void>((resolve) => {
      release = resolve;
    });
    const scope = { teamId, datasetId };
    const building = ensurePgDatasetIndex({
      ...scope,
      ...callbacks,
      onBuilding: async () => {
        admitted();
        await pause;
      }
    });
    await started;
    const removing = removePgDatasetIndex(scope);
    void removing.catch(() => {});
    try {
      await vi.waitFor(
        async () => {
          const { rows } = await pool.query(
            `SELECT count(*)::int AS waiting FROM pg_stat_activity
           WHERE application_name='fastgpt-dataset-index' AND state='idle'
           AND query LIKE 'SELECT pg_try_advisory_lock%'`
          );
          expect(rows[0].waiting).toBe(1);
        },
        { timeout: 5000, interval: 25 }
      );
    } finally {
      release();
      await building;
      await removing;
    }
    expect(
      await ensurePgDatasetIndex({ ...scope, ...callbacks, onBuilding: async () => false })
    ).toEqual({
      pgIndex: 'none',
      created: false
    });
    const indexName = `${target!.schema}.${getPgDatasetIndexName(datasetId)}`;
    expect(
      (await pool.query('SELECT to_regclass($1) AS index', [indexName])).rows[0].index
    ).toBeNull();
    // 恢复当前夹具索引，后续外部同名索引保护测试仍使用同一知识库。
    await ensurePgDatasetIndex({ ...scope, ...callbacks });
  }, 240000);

  it('removes a folder subtree from PG and Mongo only after its owned index is gone', async () => {
    const rootId = '507f1f77bcf86cd799439016';
    const childId = '507f1f77bcf86cd799439017';
    await MongoDataset.create([
      {
        _id: rootId,
        teamId,
        tmbId: new Types.ObjectId(),
        name: 'delete-root',
        type: DatasetTypeEnum.folder,
        deleteTime: new Date()
      },
      {
        _id: childId,
        parentId: rootId,
        teamId,
        tmbId: new Types.ObjectId(),
        name: 'delete-child',
        type: DatasetTypeEnum.dataset,
        deleteTime: new Date()
      }
    ]);
    const pool = await connectPg();
    const qualifiedTable = `${target!.schema}.modeldata`;
    const name = getPgDatasetIndexName(childId);
    await pool.query(
      `INSERT INTO ${qualifiedTable} (team_id,dataset_id,collection_id,vector)
       SELECT $1,$2,'delete-file',array_fill(0::real, ARRAY[${dimensions}])::vector FROM generate_series(1,400)`,
      [teamId, childId]
    );
    await pool.query(
      `CREATE INDEX ${name} ON ${qualifiedTable} USING hnsw ((vector::halfvec(${dimensions})) halfvec_ip_ops)
       WHERE dataset_id='${childId}'`
    );
    // 在真正删除 Mongo 记录的边界读取 PG 目录，证明顺序，而非只检查最终状态。
    const originalDelete = MongoDataset.deleteMany.bind(MongoDataset);
    let checkedBeforeDelete = false;
    const removeRecords = vi.spyOn(MongoDataset, 'deleteMany').mockImplementation((...args) => {
      const query = originalDelete(...args);
      const execute = query.exec.bind(query);
      query.exec = async () => {
        expect(
          (await pool.query('SELECT to_regclass($1) AS index', [`${target!.schema}.${name}`]))
            .rows[0].index
        ).toBeNull();
        checkedBeforeDelete = true;
        return execute();
      };
      return query;
    });
    try {
      await datasetDeleteProcessor({ data: { teamId, datasetId: rootId } } as never);
      expect(
        (await pool.query('SELECT to_regclass($1) AS index', [`${target!.schema}.${name}`])).rows[0]
          .index
      ).toBeNull();
      expect(await ctrl.getVectorCount({ teamId, datasetId: childId })).toBe(0);
      expect(await MongoDataset.countDocuments({ _id: { $in: [rootId, childId] } })).toBe(0);
      expect(removeRecords).toHaveBeenCalledOnce();
      expect(checkedBeforeDelete).toBe(true);
    } finally {
      removeRecords.mockRestore();
    }
  });

  it('preserves a foreign same-name index whose dataset literal differs by whitespace', async () => {
    const pool = await connectPg();
    const name = getPgDatasetIndexName(datasetId);
    const backup = `${name}_preserved`;
    await pool.query(`ALTER INDEX ${name} RENAME TO ${backup}`);
    await pool.query(
      `CREATE INDEX ${name} ON modeldata USING hnsw
       ((vector::halfvec(${dimensions})) halfvec_ip_ops)
       WHERE dataset_id=' ${datasetId}'`
    );
    const oid = (await pool.query('SELECT to_regclass($1)::oid::text AS oid', [name])).rows[0].oid;
    await pool.query(
      `DELETE FROM modeldata WHERE id IN (
        SELECT id FROM modeldata WHERE team_id=$1 AND dataset_id=$2
        ORDER BY id DESC OFFSET 4999
      )`,
      [teamId, datasetId]
    );
    await expect(ensurePgDatasetIndex({ teamId, datasetId, ...callbacks })).rejects.toThrow(
      'Refusing'
    );
    const { rows } = await pool.query(
      'SELECT to_regclass($1)::oid::text AS oid, to_regclass($2) IS NOT NULL AS preserved',
      [name, backup]
    );
    expect(rows[0]).toEqual({ oid, preserved: true });
  });
});
