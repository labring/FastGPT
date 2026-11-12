import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client, Pool } from 'pg';
import qualityDatasets from './quality.datasets.json';

const target = vi.hoisted(() => {
  const datasetRoot = process.env.FASTGPT_FULLTEXT_EVAL_DATA_ROOT;
  if (!datasetRoot) return;
  const address = process.env.FASTGPT_PG_FULLTEXT_TEST_URL;
  const outputRoot = process.env.FASTGPT_FULLTEXT_EVAL_OUTPUT_DIR;
  if (!address || !outputRoot)
    throw new Error('An isolated PG URL and evaluation output directory are required');
  const url = new URL(address);
  if (
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.pathname.startsWith('/fulltext_test')
  )
    throw new Error('Quality tests require an explicit local fulltext_test database');
  return { address, datasetRoot, outputRoot };
});
vi.unmock('@fastgpt/service/common/vectorDB/pg');
vi.unmock('@fastgpt/service/common/mongo/sessionRun');

import { Types, connectionMongo } from '@fastgpt/service/common/mongo';
import { jiebaSplit } from '@fastgpt/service/common/string/jieba/index';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetDataText } from '@fastgpt/service/core/dataset/data/dataTextSchema';
import { getFullTextStore } from '@fastgpt/service/core/dataset/data/textStore';
import { searchSqlFullText } from '@fastgpt/service/core/dataset/fullText/sql/store';
import { getSqlFullTextAdapter } from '@fastgpt/service/common/vectorDB/fullText/controller';
import { systemMigrations } from '@/migration/registry';
import { createSystemMigrationRunner } from '@/migration/runner';
import { ensureMigrationStates } from '@/migration/entity';
import { MongoSystemMigrationState } from '@/migration/mongoSchema';

type CorpusDocument = { _id: string; title: string; text: string };
type Query = { _id: string; text: string };
type Retrieval = { ids: string[]; scores: number[]; milliseconds: number };
const reports: Record<string, unknown>[] = [];

/** 同一次测试进程生成完整六组索引；默认未配置环境时跳过，不下载语料或启动业务迁移。 */
afterAll(() => {
  if (!target) return;
  mkdirSync(target.outputRoot, { recursive: true });
  writeFileSync(
    join(target.outputRoot, 'suite-results.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        status:
          reports.length === qualityDatasets.length &&
          reports.every((report) => report.status === 'PASS')
            ? 'PASS'
            : 'FAIL',
        results: reports.map(
          ({ datasetId, language, status, dataset, metrics, acceptance, error }) => ({
            datasetId,
            language,
            status,
            dataset,
            metrics,
            acceptance,
            error
          })
        )
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
});

/** 固定 qrels 的逐问题指标；空结果按零分计入，不能剔除失败或零命中的问题。 */
const score = (ids: string[], relevance: Map<string, number>) => {
  const relevant = [...relevance.values()].filter((value) => value > 0).length;
  const hits = (k: number) => ids.slice(0, k).filter((id) => (relevance.get(id) ?? 0) > 0).length;
  const first = ids.findIndex((id) => (relevance.get(id) ?? 0) > 0);
  const dcg = ids
    .slice(0, 10)
    .reduce(
      (sum, id, index) => sum + (2 ** (relevance.get(id) ?? 0) - 1) / Math.log2(index + 2),
      0
    );
  const ideal = [...relevance.values()]
    .sort((a, b) => b - a)
    .slice(0, 10)
    .reduce((sum, value, index) => sum + (2 ** value - 1) / Math.log2(index + 2), 0);
  return {
    hit1: Number(hits(1) > 0),
    hit10: Number(hits(10) > 0),
    hit50: Number(hits(50) > 0),
    precision10: hits(10) / 10,
    recall10: hits(10) / relevant,
    mrr10: first >= 0 && first < 10 ? 1 / (first + 1) : 0,
    ndcg10: dcg / ideal
  };
};

/** 外置公开语料只用于一次显式演练；不加载业务库，不把大规模数据写入仓库。 */
describe.skipIf(!target).each(qualityDatasets)(
  '$id ($language) PG full-text migration and quality',
  (dataset) => {
    const datasetPath = target ? join(target.datasetRoot, dataset.id) : '';
    const outputPath = target ? join(target.outputRoot, `${dataset.id}-results.json`) : '';
    const schema = `fulltext_quality_${process.pid}_${Date.now()}_${dataset.id.replaceAll('-', '_')}`;
    const teamId = new Types.ObjectId().toString();
    const datasetId = new Types.ObjectId().toString();
    const collectionId = new Types.ObjectId().toString();
    const runner = createSystemMigrationRunner({
      migrations: systemMigrations.filter((m) => m.id === '20261110_migrate_sql_fulltext')
    });
    let admin: Client | undefined;
    let pool: Pool | undefined;
    let previousPool: typeof global.pgClient;
    let created = false;
    const report: Record<string, unknown> = {
      datasetId: dataset.id,
      language: dataset.language,
      source: dataset,
      status: 'RUNNING',
      startedAt: new Date().toISOString()
    };
    reports.push(report);
    const saveReport = () =>
      writeFileSync(outputPath, JSON.stringify(report, null, 2), { mode: 0o600 });

    beforeAll(async () => {
      mkdirSync(target!.outputRoot, { recursive: true });
      saveReport();
      admin = new Client({ connectionString: target!.address });
      await admin.connect();
      await admin.query(`CREATE SCHEMA ${schema}`);
      created = true;
      pool = new Pool({
        connectionString: target!.address,
        options: `-csearch_path=${schema},public`,
        max: 4
      });
      previousPool = global.pgClient;
      global.pgClient = pool;
      await pool.query(`CREATE TABLE modeldata (id BIGSERIAL PRIMARY KEY,vector VECTOR(1536) NOT NULL,
      team_id VARCHAR(50) NOT NULL,dataset_id VARCHAR(50) NOT NULL,collection_id VARCHAR(50) NOT NULL,
      createtime TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
      report.environment = (
        await pool.query(`SELECT version() AS version,
      (SELECT extversion FROM pg_extension WHERE extname='pg_search') AS pg_search,
      (SELECT extversion FROM pg_extension WHERE extname='vector') AS pgvector`)
      ).rows[0];
      report.mongoVersion = (await connectionMongo.connection.db!.admin().serverInfo()).version;
      saveReport();
    });
    afterAll(async () => {
      runner.stop();
      global.pgClient = previousPool;
      await pool?.end();
      if (created) await admin?.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin?.end();
    });

    it('migrates the complete corpus, cleans legacy Mongo rows and verifies PG retrieval quality against the legacy baseline', async () => {
      try {
        const inputFiles = ['corpus.jsonl', 'queries.jsonl', 'qrels/test.tsv'];
        const raw = inputFiles.map((name) => readFileSync(join(datasetPath, name), 'utf8'));
        for (const [index, name] of inputFiles.entries()) {
          expect(
            createHash('sha256').update(raw[index]).digest('hex'),
            `${dataset.id}/${name}`
          ).toBe(dataset.inputs[name as keyof typeof dataset.inputs]);
        }
        const corpus: CorpusDocument[] = raw[0]
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line));
        const queries = new Map<string, Query>(
          raw[1]
            .trim()
            .split('\n')
            .map((line) => {
              const query: Query = JSON.parse(line);
              return [query._id, query];
            })
        );
        const qrels = new Map<string, Map<string, number>>();
        for (const line of raw[2].trim().split('\n').slice(1)) {
          const [queryId, documentId, relevance] = line.split('\t');
          if (!qrels.has(queryId)) qrels.set(queryId, new Map());
          qrels.get(queryId)!.set(documentId, Number(relevance));
        }
        const documentIds = new Set(corpus.map((doc) => doc._id));
        expect(corpus.length).toBe(dataset.counts.corpus);
        expect(qrels.size).toBe(dataset.counts.queries);
        expect([...qrels.values()].reduce((sum, value) => sum + value.size, 0)).toBe(
          dataset.counts.judgments
        );
        expect(documentIds.size).toBe(corpus.length);
        expect(new Set(queries.keys()).size).toBe(raw[1].trim().split('\n').length);
        for (const [queryId, relevance] of qrels) {
          expect(queries.has(queryId)).toBe(true);
          expect([...relevance].some(([, value]) => value > 0)).toBe(true);
          for (const id of relevance.keys()) expect(documentIds.has(id)).toBe(true);
        }

        const sourceIds = new Map<string, string>();
        const documents = corpus.map((doc, index) => {
          const _id = new Types.ObjectId(
            createHash('sha256').update(`fulltext-eval:${doc._id}`).digest('hex').slice(0, 24)
          );
          sourceIds.set(String(_id), doc._id);
          const text = [doc.title, doc.text].filter(Boolean).join('\n');
          return {
            _id,
            teamId: new Types.ObjectId(teamId),
            datasetId: new Types.ObjectId(datasetId),
            collectionId: new Types.ObjectId(collectionId),
            tmbId: new Types.ObjectId(),
            synonymVersion: 0,
            q: text,
            a: '',
            indexes: [{ dataId: String(index + 1), text, type: 'custom' }]
          };
        });
        const vector = `[1,${Array(1535).fill(0).join(',')}]`;
        await pool!.query(
          `INSERT INTO modeldata(id,vector,team_id,dataset_id,collection_id)
        SELECT n,$1::vector,$2,$3,$4 FROM generate_series(1,$5::int) n`,
          [vector, teamId, datasetId, collectionId, corpus.length]
        );

        // 独立测试基线集合模拟旧版 Mongo $text 索引，便于迁移清理 dataset_data_texts 后仍可做配对对比。
        const baselineCollection = connectionMongo.connection.db!.collection(
          `legacy_text_baseline_${dataset.id.replaceAll('-', '_')}`
        );
        await baselineCollection.createIndex(
          { teamId: 1, fullTextToken: 'text' },
          { name: 'teamId_1_fullTextToken_text', default_language: 'none' }
        );
        for (let start = 0; start < documents.length; start += 250) {
          const chunk = documents.slice(start, start + 250);
          await MongoDatasetData.collection.insertMany(chunk);
          const legacyRows = await Promise.all(
            chunk.map(async (doc) => ({
              teamId: new Types.ObjectId(teamId),
              datasetId: new Types.ObjectId(datasetId),
              collectionId: new Types.ObjectId(collectionId),
              dataId: doc._id,
              fullTextToken: await jiebaSplit({ text: doc.q })
            }))
          );
          await MongoDatasetDataText.collection.insertMany(legacyRows);
          await baselineCollection.insertMany(legacyRows);
        }

        const snapshot = async () => {
          const fingerprint = async (rows: AsyncIterable<unknown>) => {
            const hash = createHash('sha256');
            let count = 0;
            for await (const row of rows) {
              hash.update(`${JSON.stringify(row)}\n`);
              count++;
            }
            expect(count).toBe(corpus.length);
            return hash.digest('hex');
          };
          async function* vectorRows() {
            let lastId = '0';
            while (true) {
              const { rows } = await pool!.query(
                'SELECT id::text,vector::text,team_id,dataset_id,collection_id,createtime FROM modeldata WHERE modeldata.id>$1 ORDER BY modeldata.id LIMIT 1000',
                [lastId]
              );
              if (!rows.length) return;
              for (const row of rows) yield row;
              lastId = rows.at(-1)!.id;
            }
          }
          return {
            documents: await fingerprint(MongoDatasetData.collection.find().sort({ _id: 1 })),
            vectors: await fingerprint(vectorRows())
          };
        };
        const before = await snapshot();
        const migrations = systemMigrations.filter((m) => m.id === '20261110_migrate_sql_fulltext');
        await ensureMigrationStates(migrations);
        const started = performance.now();
        await runner.tick();
        const migration = await MongoSystemMigrationState.findById(
          '20261110_migrate_sql_fulltext'
        ).lean();
        expect(migration).toMatchObject({
          status: 'succeeded',
          result: {
            prechecked: corpus.length,
            scanned: corpus.length,
            validated: corpus.length
          }
        });
        expect(await MongoDatasetDataText.countDocuments()).toBe(corpus.length);
        const after = await snapshot();
        expect(after).toEqual(before);
        expect(
          (
            await pool!.query(
              'SELECT count(*)::int AS n FROM modeldata WHERE fulltext_tokens IS NULL'
            )
          ).rows[0].n
        ).toBe(0);
        const expectedRows = documents.map((doc) => ({
          vectorId: doc.indexes[0].dataId,
          teamId,
          datasetId,
          collectionId,
          text: doc.q
        }));
        expect(await getSqlFullTextAdapter().fill(expectedRows, true)).toEqual([]);
        report.migration = {
          documents: corpus.length,
          vectors: corpus.length,
          oldFullText: corpus.length,
          milliseconds: performance.now() - started,
          before,
          after,
          nullText: 0,
          invalidText: 0,
          result: migration!.result
        };
        report.hashRule =
          'SHA-256 of JSON rows plus newline, ordered by immutable ID; vectors read in batches of 1000';
        report.dataset = {
          files: Object.fromEntries(
            inputFiles.map((file, index) => [
              file,
              createHash('sha256').update(raw[index]).digest('hex')
            ])
          ),
          corpus: corpus.length,
          queries: qrels.size,
          judgments: [...qrels.values()].reduce((sum, value) => sum + value.size, 0),
          textRule: 'title + newline + text, one corpus document per business block, no chunking',
          denseVectors: 'fixed synthetic vectors; this run evaluates full text only',
          limit: 50
        };
        saveReport();
        const props = (query: string) => ({
          teamId,
          datasetIds: [datasetId],
          query,
          limit: 50,
          forbidCollectionIdList: [] as string[]
        });
        const searchLegacyBaseline = async (query: string) => {
          const searchTokens = await jiebaSplit({ text: query });
          if (!searchTokens.trim()) return [];
          return baselineCollection
            .aggregate<{ dataId: Types.ObjectId; score: number }>([
              {
                $match: {
                  teamId: new Types.ObjectId(teamId),
                  $text: { $search: searchTokens },
                  datasetId: { $in: [new Types.ObjectId(datasetId)] }
                }
              },
              { $project: { dataId: 1, score: { $meta: 'textScore' } } },
              { $sort: { score: -1 } },
              { $limit: 50 }
            ])
            .toArray();
        };
        const retrieve = async (query: string, engine: 'mongo' | 'pg'): Promise<Retrieval> => {
          const t0 = performance.now();
          if (engine === 'mongo') {
            const hits = await searchLegacyBaseline(query);
            return {
              ids: hits.map((hit) => sourceIds.get(String(hit.dataId))!),
              scores: hits.map((hit) => hit.score),
              milliseconds: performance.now() - t0
            };
          }
          const hits = await searchSqlFullText(props(query));
          return {
            ids: hits.map((hit) => sourceIds.get(hit.dataId)!),
            scores: hits.map((hit) => hit.score),
            milliseconds: performance.now() - t0
          };
        };
        const selected = [...qrels.keys()].sort((a, b) => a.localeCompare(b));
        const beforeMaintenance = [];
        const segmentsBeforeMaintenance = (
          await pool!.query("SELECT * FROM pdb.index_segments('modeldata_fulltext'::regclass)")
        ).rows;
        const probes = selected.slice(0, 10);
        for (const id of probes)
          beforeMaintenance.push({ queryId: id, ...(await retrieve(queries.get(id)!.text, 'pg')) });
        const maintenanceStarted = performance.now();
        await pool!.query('VACUUM (ANALYZE) modeldata');
        const maintenanceMilliseconds = performance.now() - maintenanceStarted;
        const afterMaintenance = [];
        for (const id of selected.slice(0, 10))
          afterMaintenance.push({ queryId: id, ...(await retrieve(queries.get(id)!.text, 'pg')) });
        report.maintenance = {
          operation: 'VACUUM (ANALYZE) modeldata on isolated target only',
          milliseconds: maintenanceMilliseconds,
          segmentsBefore: segmentsBeforeMaintenance,
          segmentsAfter: (
            await pool!.query("SELECT * FROM pdb.index_segments('modeldata_fulltext'::regclass)")
          ).rows,
          before: beforeMaintenance,
          after: afterMaintenance
        };
        expect(await snapshot()).toEqual(before);
        saveReport();
        for (const id of selected.slice(0, 5)) {
          await retrieve(queries.get(id)!.text, 'mongo');
          await retrieve(queries.get(id)!.text, 'pg');
        }
        const results = [];
        for (const [index, id] of selected.entries()) {
          const query = queries.get(id)!.text;
          let mongo: Retrieval;
          let pg: Retrieval;
          if (index % 2 === 0) {
            mongo = await retrieve(query, 'mongo');
            pg = await retrieve(query, 'pg');
          } else {
            pg = await retrieve(query, 'pg');
            mongo = await retrieve(query, 'mongo');
          }
          expect(mongo.ids.every(Boolean) && pg.ids.every(Boolean)).toBe(true);
          results.push({
            queryId: id,
            qrels: Object.fromEntries(qrels.get(id)!),
            mongo: { ...mongo, metrics: score(mongo.ids, qrels.get(id)!) },
            pg: { ...pg, metrics: score(pg.ids, qrels.get(id)!) }
          });
          if ((index + 1) % 100 === 0)
            console.info('Full-text labeled queries evaluated', {
              current: index + 1,
              total: selected.length
            });
        }
        const aggregate = (engine: 'mongo' | 'pg') => {
          const values = results.map((result) => result[engine]);
          const metrics = Object.fromEntries(
            Object.keys(values[0].metrics).map((key) => [
              key,
              values.reduce(
                (sum, value) => sum + value.metrics[key as keyof typeof value.metrics],
                0
              ) / values.length
            ])
          );
          const times = values.map((value) => value.milliseconds).sort((a, b) => a - b);
          return {
            ...metrics,
            p50: times[Math.ceil(times.length * 0.5) - 1],
            p95: times[Math.ceil(times.length * 0.95) - 1],
            mean: times.reduce((sum, value) => sum + value, 0) / times.length,
            queryCount: values.length,
            errors: 0
          };
        };
        report.metrics = { mongo: aggregate('mongo'), pg: aggregate('pg') };
        report.results = results;
        const acceptance = {
          metrics: ['hit10', 'mrr10', 'ndcg10'],
          rule: 'PG must not regress against the paired Mongo baseline',
          passed: false
        };
        report.acceptance = acceptance;
        saveReport();
        for (const metric of ['hit10', 'mrr10', 'ndcg10'] as const) {
          expect(
            results.reduce((sum, result) => sum + result.pg.metrics[metric], 0),
            `${dataset.id} ${metric}`
          ).toBeGreaterThanOrEqual(
            results.reduce((sum, result) => sum + result.mongo.metrics[metric], 0)
          );
        }
        acceptance.passed = true;
        report.indexSegments = (
          await pool!.query("SELECT * FROM pdb.index_segments('modeldata_fulltext'::regclass)")
        ).rows;
        saveReport();

        const nativeSearch = vi.spyOn(getSqlFullTextAdapter(), 'search');
        const storeChecks = [];
        for (const result of results.slice(0, 10)) {
          const direct = await retrieve(queries.get(result.queryId)!.text, 'pg');
          const actual = await getFullTextStore().search(props(queries.get(result.queryId)!.text));
          storeChecks.push({
            queryId: result.queryId,
            baseline: result.pg,
            direct,
            store: {
              ids: actual.map((hit) => sourceIds.get(hit.dataId)),
              scores: actual.map((hit) => hit.score)
            }
          });
        }
        report.storeChecks = storeChecks;
        saveReport();
        for (const check of storeChecks) {
          expect(check.direct.ids).toEqual(check.baseline.ids);
          expect(check.store.ids).toEqual(check.direct.ids);
        }
        expect(nativeSearch).toHaveBeenCalledTimes(probes.length * 2);
        nativeSearch.mockRestore();
        report.status = 'PASS';
        report.finishedAt = new Date().toISOString();
        saveReport();
        console.info('Labeled full-text evaluation summary', {
          dataset: report.dataset,
          metrics: report.metrics
        });
      } catch (error) {
        report.status = 'FAIL';
        report.error = error instanceof Error ? error.message : String(error);
        report.finishedAt = new Date().toISOString();
        saveReport();
        throw error;
      } finally {
        const collections = (await connectionMongo.connection.db?.collections()) ?? [];
        await Promise.all(collections.map((collection) => collection.deleteMany({})));
      }
    }, 1800000);
  }
);
