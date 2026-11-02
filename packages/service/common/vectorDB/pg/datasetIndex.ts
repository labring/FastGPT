import pg from 'pg';
import { ObjectIdSchema } from '@fastgpt/global/common/type/mongo';
import {
  DATASET_VECTOR_INDEX_MIN_ROWS,
  DATASET_VECTOR_INDEX_DROP_ROWS
} from '@fastgpt/global/core/dataset/vectorData/constants';
import { DatasetVectorTableName, PG_ADDRESS } from '../constants';
import { PgClient } from './controller';
import { getLogger, LogCategories } from '../../logger';
import { configurePgIndexMemory } from './indexMemory';

const logger = getLogger(LogCategories.INFRA.POSTGRES);
// 升级清理旧全局索引与局部索引 CREATE / DROP 共用此会话锁。
export const PG_INDEX_MAINTENANCE_LOCK = 41823001;

export type PgDatasetIndexScope = { teamId: string; datasetId: string };
export type PgDatasetIndexProgress = {
  phase: string;
  blocksDone: number;
  blocksTotal: number;
  tuplesDone: number;
  tuplesTotal: number;
};

/** 名字由知识库 ID 唯一推导，不在 Mongo 中存储或信任外部传入的索引名。 */
export const getPgDatasetIndexName = (datasetId: string) => {
  return `${DatasetVectorTableName}_fp16_${ObjectIdSchema.parse(datasetId)}`;
};

/**
 * 在线维护知识库 FP16 局部索引：超过三万建图，低于两万移除，原列和中间区间保持不变。
 * 全局 PG 会话锁串行 CREATE / DROP；只操作定义完全匹配的索引，移除前通知业务切换查询路径。
 */
export const ensurePgDatasetIndex = async ({
  teamId,
  datasetId,
  onBuilding,
  onRemoving,
  onProgress
}: PgDatasetIndexScope & {
  onBuilding: () => Promise<void>;
  onRemoving?: () => Promise<void>;
  onProgress: (progress: PgDatasetIndexProgress) => void;
}): Promise<{ pgIndex: 'ready' | 'none'; created: boolean }> => {
  const indexName = getPgDatasetIndexName(datasetId);

  // 普通池有 60 秒 query_timeout；建图使用独立会话，不能把连接池查询配置改为无限等待。
  const client = new pg.Client({
    connectionString: PG_ADDRESS,
    application_name: 'fastgpt-dataset-index',
    connectionTimeoutMillis: 30000,
    query_timeout: 0,
    statement_timeout: 0,
    keepAlive: true
  });
  client.on('notice', (notice) => {
    logger.warn('PG dataset index build notice', {
      teamId,
      datasetId,
      message: notice.message,
      detail: notice.detail,
      hint: notice.hint
    });
  });
  client.on('error', (error) =>
    logger.error('PG dataset index connection error', { error, datasetId })
  );

  let progressTimer: ReturnType<typeof setInterval> | undefined;
  let progressQuery: Promise<void> | undefined;
  try {
    await client.connect();
    // 1. 按实际列类型核验索引，兼容配置决定的 vector / halfvec 存储。
    const { rows: tables } = await client.query<{
      schema: string;
      dimensions: number;
      vector_type: string;
    }>(
      `SELECT n.nspname AS schema, a.atttypmod AS dimensions, t.typname AS vector_type
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'vector'
       JOIN pg_type t ON t.oid = a.atttypid
       WHERE c.oid = to_regclass($1)`,
      [DatasetVectorTableName]
    );
    const table = tables[0];
    if (
      !table ||
      !['vector', 'halfvec'].includes(table.vector_type) ||
      table.dimensions < 1 ||
      table.dimensions > 4000
    ) {
      throw new Error(
        'Dataset FP16 indexing requires a dimensioned vector or halfvec column (1..4000)'
      );
    }
    const qualifiedTable = `${pg.escapeIdentifier(table.schema)}.${pg.escapeIdentifier(DatasetVectorTableName)}`;
    const qualifiedIndex = `${pg.escapeIdentifier(table.schema)}.${pg.escapeIdentifier(indexName)}`;
    const predicate = `dataset_id = ${pg.escapeLiteral(datasetId)} AND team_id = ${pg.escapeLiteral(teamId)}`;

    /** 目录核验同时检查表、方法、opclass、表达式、谓词，避免误用或删除同名自建索引。 */
    const readIndex = async () => {
      const { rows } = await client.query<{
        valid: boolean;
        ready: boolean;
        on_table: boolean;
        method: string;
        opclass: string;
        expression: string;
        predicate: string;
        columns: number;
      }>(
        `SELECT i.indisvalid AS valid, i.indisready AS ready,
                i.indrelid = to_regclass($2) AS on_table, am.amname AS method,
                op.opcname AS opclass, i.indnatts AS columns,
                pg_get_indexdef(c.oid, 1, false) AS expression,
                pg_get_expr(i.indpred, i.indrelid) AS predicate
         FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
         JOIN pg_am am ON am.oid = c.relam
         JOIN pg_opclass op ON op.oid = i.indclass[0]
         WHERE c.oid = to_regclass($1)`,
        [qualifiedIndex, qualifiedTable]
      );
      const index = rows[0];
      if (!index) return;
      // 仅消除语法差异；字符串常量和未知引号标识符的内容必须保留，避免误认其他团队或其他列的索引。
      const normalize = (value: string) =>
        value.replace(
          /'(?:[^']|'')*'|"(?:[^"]|"")*"|::(?:text|character varying)|[\s()]/g,
          (token) => {
            if (token.startsWith("'")) return token;
            if (token.startsWith('"')) {
              const identifier = token.slice(1, -1);
              return ['vector', 'halfvec', 'dataset_id', 'team_id'].includes(identifier)
                ? identifier
                : token;
            }
            return '';
          }
        );
      const expression = normalize(index.expression);
      // halfvec 列转为相同维度的 halfvec 时，PG 会消除恒等转换，将索引键记录为 vector 列。
      const matchesExpression =
        expression === `vector::halfvec${table.dimensions}` ||
        (table.vector_type === 'halfvec' && expression === 'vector');
      if (
        !index.on_table ||
        index.columns !== 1 ||
        index.method !== 'hnsw' ||
        index.opclass !== 'halfvec_ip_ops' ||
        !matchesExpression ||
        normalize(index.predicate ?? '') !== normalize(predicate)
      ) {
        throw new Error(`Refusing to reuse or remove mismatched PG index: ${indexName}`);
      }
      return index;
    };

    /** 维护决策只使用 PG 实际行数，不能依赖十分钟前的 Redis 计数。 */
    const countRows = async () => {
      const { rows } = await client.query<{ count: string }>(
        `SELECT count(*) FROM ${qualifiedTable} WHERE ${predicate}`
      );
      return Number(rows[0].count);
    };

    const reuseIndex = () => {
      logger.info('PG dataset FP16 index already exists; skipped build', { datasetId, indexName });
      return { pgIndex: 'ready' as const, created: false };
    };

    let existing = await readIndex();
    if (
      existing?.valid &&
      existing.ready &&
      (await countRows()) >= DATASET_VECTOR_INDEX_DROP_ROWS
    ) {
      return reuseIndex();
    }

    // 2. CREATE / DROP 共用会话锁；拿到锁后再次核验目录和行数，避免处理旧任务时误删回涨的索引。
    const { rows: lock } = await client.query<{ locked: boolean }>(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [PG_INDEX_MAINTENANCE_LOCK]
    );
    if (!lock[0].locked) throw new Error('Another PG dataset index maintenance is still running');
    existing = await readIndex();
    const rows = await countRows();

    /** 先停止新查询使用该索引，再在线移除；通知失败时不执行 DROP，交给队列重试。 */
    const removeIndex = async () => {
      await onRemoving?.();
      await client.query(`DROP INDEX CONCURRENTLY ${qualifiedIndex}`);
      logger.info('PG dataset FP16 index removed', { teamId, datasetId, indexName, rows });
    };

    if (existing?.valid && existing.ready) {
      if (rows >= DATASET_VECTOR_INDEX_DROP_ROWS) return reuseIndex();
      await removeIndex();
      return { pgIndex: 'none', created: false };
    }
    if (rows <= DATASET_VECTOR_INDEX_MIN_ROWS) {
      // 失败索引不属于可保留状态；低于建图阈值时只清理，不重新构建。
      if (existing) await removeIndex();
      return { pgIndex: 'none', created: false };
    }
    const memory = await configurePgIndexMemory({
      client,
      rows,
      dimensions: table.dimensions
    });
    // 始终与 PG 原预算比较；即使会话预算已调高，也要提示估算超过原配置。
    if (memory.estimatedMB > memory.configuredMB) {
      logger.warn(
        'PG index memory estimate exceeds maintenance_work_mem; review memory configuration',
        {
          teamId,
          datasetId,
          indexName,
          ...memory,
          diskBasedBuildMayBeNeeded: memory.budgetMB < memory.estimatedMB
        }
      );
    }
    await onBuilding();
    if (existing) await client.query(`DROP INDEX CONCURRENTLY ${qualifiedIndex}`);

    const { rows: settings } = await client.query<{
      pid: number;
      maintenance_work_mem: string;
      parallel_workers: string;
    }>(
      `SELECT pg_backend_pid() AS pid, current_setting('maintenance_work_mem') AS maintenance_work_mem,
              current_setting('max_parallel_maintenance_workers') AS parallel_workers`
    );
    logger.info('PG dataset FP16 index build started', {
      teamId,
      datasetId,
      indexName,
      rows,
      dimensions: table.dimensions,
      memory,
      ...settings[0]
    });

    // 3. 监控连接与 DDL 分离，任意时刻最多一个进度查询；进度采集失败不取消正在运行的建图。
    const reportProgress = async () => {
      try {
        const { rows } = await PgClient.query<{
          phase: string;
          blocks_done: string;
          blocks_total: string;
          tuples_done: string;
          tuples_total: string;
        }>(
          `SELECT phase, blocks_done, blocks_total, tuples_done, tuples_total
           FROM pg_stat_progress_create_index WHERE pid = $1`,
          [settings[0].pid]
        );
        if (!rows[0]) return;
        const progress = rows[0];
        onProgress({
          phase: progress.phase,
          blocksDone: Number(progress.blocks_done),
          blocksTotal: Number(progress.blocks_total),
          tuplesDone: Number(progress.tuples_done),
          tuplesTotal: Number(progress.tuples_total)
        });
      } catch (error) {
        logger.warn('PG dataset index progress query failed', { datasetId, error });
      }
    };
    progressTimer = setInterval(() => {
      if (progressQuery) return;
      progressQuery = reportProgress().finally(() => {
        progressQuery = undefined;
      });
    }, 5000);
    progressTimer.unref();

    await client.query(
      `CREATE INDEX CONCURRENTLY ${pg.escapeIdentifier(indexName)} ON ${qualifiedTable}
       USING hnsw ((vector::halfvec(${table.dimensions})) halfvec_ip_ops)
       WITH (m = 16, ef_construction = 128) WHERE ${predicate}`
    );
    const built = await readIndex();
    if (!built?.valid || !built.ready)
      throw new Error('PG dataset FP16 index is not valid after build');
    return { pgIndex: 'ready', created: true };
  } finally {
    if (progressTimer) clearInterval(progressTimer);
    await progressQuery;
    // 关闭独立会话同时释放 advisory lock；即使 CREATE / DROP 失败也不把锁留给下一轮。
    await client.end();
  }
};
