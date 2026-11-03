import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client } from 'pg';

// 只有显式指定的本机 PG 可执行；所有 DDL 和向量夹具都限制在临时 schema 中。
const target = vi.hoisted(() => {
  const address = process.env.FASTGPT_PG_INDEX_TEST_URL;
  if (!address) return;
  const url = new URL(address);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('Legacy index integration tests require an explicit local PG instance');
  }
  const schema = `fastgpt_legacy_index_test_${process.pid}`;
  const guardSchema = `${schema}_guard`;
  url.searchParams.set('options', `-csearch_path=${schema},${guardSchema},public`);
  return { schema, guardSchema, connectionString: url.toString() };
});
vi.mock('@fastgpt/service/common/vectorDB/constants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  PG_ADDRESS: target?.connectionString,
  DatasetVectorTableName: 'modeldata'
}));

import { removeLegacyPgVectorIndex } from '@/migration/tasks/4174/20261022_initialize_dataset_vector_indexes/service';
import {
  PG_INDEX_MAINTENANCE_LOCK,
  getPgDatasetIndexName
} from '@fastgpt/service/common/vectorDB/pg/datasetIndex';
import { buildPgVectorRecallQuery } from '@fastgpt/service/common/vectorDB/pg/utils';

describe.skipIf(!target).each(['vector', 'halfvec'])(
  'legacy global HNSW cleanup with %s storage',
  (storage) => {
    const admin = new Client({ connectionString: target?.connectionString });
    const datasetId = '507f1f77bcf86cd799439012';
    const localIndex = getPgDatasetIndexName(datasetId);
    const qualifiedTable = `${target?.schema}.modeldata`;
    const qualifiedIndex = `${target?.schema}.vector_index`;
    const createContext = (controller = new AbortController()) => ({
      signal: controller.signal,
      assertActive: async () => {},
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    });
    const exists = async () => {
      const { rows } = await admin.query('SELECT to_regclass($1) IS NOT NULL AS exists', [
        qualifiedIndex
      ]);
      return rows[0].exists;
    };
    const waitForDdlLock = (applicationName = 'fastgpt-legacy-vector-index-cleanup') =>
      vi.waitFor(
        async () => {
          const { rows } = await admin.query(
            `SELECT count(*)::int AS count FROM pg_stat_activity
           WHERE datname = current_database() AND application_name = $1
           AND state = 'active' AND wait_event_type = 'Lock'`,
            [applicationName]
          );
          expect(rows[0].count).toBe(1);
        },
        { timeout: 5000, interval: 25 }
      );

    beforeAll(async () => {
      await admin.connect();
      await admin.query(`CREATE SCHEMA ${target!.schema}`);
      await admin.query(`CREATE SCHEMA ${target!.guardSchema}`);
      await admin.query(`CREATE TABLE ${target!.guardSchema}.canary (value int)`);
      // search_path 的后备 schema 放置同名索引，确保清理永远不会回退到其他 schema。
      await admin.query(`CREATE INDEX vector_index ON ${target!.guardSchema}.canary (value)`);
      await admin.query(`CREATE TABLE ${qualifiedTable} (
        id bigserial PRIMARY KEY, team_id text, dataset_id text, collection_id text,
        vector ${storage}(16), createtime timestamp DEFAULT now()
      )`);
      await admin.query(
        `INSERT INTO ${qualifiedTable} (team_id, dataset_id, collection_id, vector)
         SELECT 'team', $1, 'file', ARRAY[g / 400.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]::vector
         FROM generate_series(1, 400) g`,
        [datasetId]
      );
      await admin.query(
        `CREATE INDEX team_dataset_collection_index ON ${qualifiedTable} (team_id, dataset_id, collection_id)`
      );
      await admin.query(`CREATE INDEX create_time_index ON ${qualifiedTable} (createtime)`);
      await admin.query(
        `CREATE INDEX ${localIndex} ON ${qualifiedTable} USING hnsw
         ((vector::halfvec(16)) halfvec_ip_ops) WHERE dataset_id = '${datasetId}'`
      );
    });
    beforeEach(async () => {
      await admin.query(
        `CREATE INDEX CONCURRENTLY vector_index ON ${qualifiedTable}
         USING hnsw (vector ${storage}_ip_ops) WITH (m = 32, ef_construction = 128)`
      );
    });
    afterEach(async () => {
      await admin.query(`DROP INDEX IF EXISTS ${qualifiedIndex}`);
      const { rows } = await admin.query('SELECT to_regclass($1) IS NOT NULL AS exists', [
        `${target!.guardSchema}.vector_index`
      ]);
      expect(rows[0].exists).toBe(true);
    });
    afterAll(async () => {
      await admin.query(`DROP SCHEMA IF EXISTS ${target!.schema} CASCADE`);
      await admin.query(`DROP SCHEMA IF EXISTS ${target!.guardSchema} CASCADE`);
      await admin.end();
    });

    it('removes only the global index, preserves data and other indexes, and permits both query paths', async () => {
      const snapshot = async () => {
        const { rows: indexes } = await admin.query(
          `SELECT c.oid::text, c.relname, pg_get_indexdef(c.oid) AS definition
           FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
           WHERE i.indrelid = '${qualifiedTable}'::regclass AND c.relname <> 'vector_index'
           ORDER BY c.relname`
        );
        const { rows: data } = await admin.query(
          `SELECT count(*)::int, md5(string_agg(id::text || ':' || vector::text, ',' ORDER BY id)) AS fingerprint FROM ${qualifiedTable}`
        );
        return { indexes, data };
      };
      const before = await snapshot();
      await removeLegacyPgVectorIndex(createContext());
      expect(await exists()).toBe(false);
      await removeLegacyPgVectorIndex(createContext());
      expect(await snapshot()).toEqual(before);

      for (const indexed of [false, true]) {
        const query = buildPgVectorRecallQuery({
          teamId: 'team',
          datasetIds: [datasetId],
          vector: [1, ...Array(15).fill(0)],
          limit: 5,
          forbidCollectionIdList: [],
          datasetVectorData: indexed ? [{ datasetId, rows: 40000, pgIndex: 'ready' }] : []
        })!;
        const { rows } = await admin.query(query.text, query.values);
        expect(rows.map(({ id }) => Number(id))).toEqual([400, 399, 398, 397, 396]);
      }
    });

    it('also cleans an invalid legacy index left by interrupted maintenance', async () => {
      // 仅在测试 schema 中合成失败状态，验证清理不要求 indisvalid/indisready 为 true。
      await admin.query(
        'UPDATE pg_index SET indisvalid = false, indisready = false WHERE indexrelid = to_regclass($1)',
        [qualifiedIndex]
      );
      await removeLegacyPgVectorIndex(createContext());
      expect(await exists()).toBe(false);
    });

    it('refuses a same-name partial index', async () => {
      await admin.query(`DROP INDEX ${qualifiedIndex}`);
      await admin.query(
        `CREATE INDEX vector_index ON ${qualifiedTable} USING hnsw (vector ${storage}_ip_ops)
         WHERE dataset_id = '${datasetId}'`
      );
      await expect(removeLegacyPgVectorIndex(createContext())).rejects.toThrow('mismatched');
      expect(await exists()).toBe(true);
    });

    it('removes the global index while the local maintenance lock is held', async () => {
      await admin.query('SELECT pg_advisory_lock($1)', [PG_INDEX_MAINTENANCE_LOCK]);
      const cleanup = removeLegacyPgVectorIndex(createContext());
      try {
        await vi.waitFor(async () => expect(await exists()).toBe(false), { timeout: 5000 });
      } finally {
        await admin.query('SELECT pg_advisory_unlock($1)', [PG_INDEX_MAINTENANCE_LOCK]);
        await cleanup;
      }
      expect(await exists()).toBe(false);
    });

    it.each(['cleanup', 'build'] as const)(
      'lets PG coordinate concurrent DDL when %s is submitted first',
      async (first) => {
        const blocker = new Client({ connectionString: target?.connectionString });
        const builder = new Client({
          connectionString: target?.connectionString,
          application_name: 'fastgpt-legacy-index-test-build'
        });
        const newIndex = `${localIndex}_concurrent`;
        let cleanup: Promise<void> | undefined;
        let building: Promise<unknown> | undefined;
        try {
          await blocker.connect();
          await builder.connect();
          await blocker.query('BEGIN');
          await blocker.query(`LOCK TABLE ${qualifiedTable} IN SHARE UPDATE EXCLUSIVE MODE`);
          const startCleanup = () => {
            cleanup = removeLegacyPgVectorIndex(createContext());
            void cleanup.catch(() => {});
          };
          const startBuild = () => {
            building = builder.query(
              `CREATE INDEX CONCURRENTLY ${newIndex} ON ${qualifiedTable} USING hnsw
               ((vector::halfvec(16)) halfvec_ip_ops) WHERE dataset_id = '${datasetId}'`
            );
            void building.catch(() => {});
          };
          // 用真实表锁固定提交先后顺序，覆盖 PG 内部锁等待，不借用局部索引 advisory lock。
          if (first === 'cleanup') {
            startCleanup();
            await waitForDdlLock();
            startBuild();
            await waitForDdlLock('fastgpt-legacy-index-test-build');
          } else {
            startBuild();
            await waitForDdlLock('fastgpt-legacy-index-test-build');
            startCleanup();
            await waitForDdlLock();
          }
          await blocker.query('COMMIT');
          await Promise.all([cleanup, building]);
          expect(await exists()).toBe(false);
          const { rows } = await admin.query(
            'SELECT indisvalid, indisready FROM pg_index WHERE indexrelid = to_regclass($1)',
            [`${target!.schema}.${newIndex}`]
          );
          expect(rows).toEqual([{ indisvalid: true, indisready: true }]);
        } finally {
          await blocker.end();
          await builder.end();
          await Promise.allSettled([cleanup, building]);
          await admin.query(`DROP INDEX IF EXISTS ${target!.schema}.${newIndex}`);
        }
      }
    );

    it('cancels a blocked DROP on lease abort and succeeds on a later retry', async () => {
      const controller = new AbortController();
      const blocker = new Client({ connectionString: target?.connectionString });
      await blocker.connect();
      await blocker.query('BEGIN');
      await blocker.query(`LOCK TABLE ${qualifiedTable} IN SHARE UPDATE EXCLUSIVE MODE`);
      const cleanup = removeLegacyPgVectorIndex(createContext(controller));
      const rejected = expect(cleanup).rejects.toThrow();
      try {
        await waitForDdlLock();
        controller.abort();
        await rejected;
        expect(await exists()).toBe(true);
      } finally {
        controller.abort();
        await blocker.end();
        await rejected;
      }
      await removeLegacyPgVectorIndex(createContext());
      expect(await exists()).toBe(false);
    });
  }
);
