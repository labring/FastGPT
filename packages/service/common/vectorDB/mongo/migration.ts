import pg, { type Client } from 'pg';
import z from 'zod';
import {
  DatasetDataEmbeddingSchema,
  type DatasetDataEmbedding
} from '@fastgpt/global/core/dataset/data/embedding/type';
import { assertMongoEmbeddingVector } from './utils';
import { connectEmbeddingMongo, initEmbeddingMongo } from './controller';
import { embeddingMongo, MongoDatasetDataEmbedding } from './schema';

const OptionsSchema = z.object({
  execute: z.boolean().default(false),
  batchSize: z.number().int().min(1).max(1000).default(100)
});

/** 默认只校验；执行模式保持 PG 源表只读，保留主键，失败后可从头幂等重跑。 */
export const parsePgEmbeddingMigrationOptions = (args: string[]) => {
  const options = { execute: false, batchSize: 100 };
  for (const arg of args.filter((value) => value !== '--')) {
    if (arg === '--execute') options.execute = true;
    else if (arg === '--dry-run') options.execute = false;
    else if (arg.startsWith('--batch-size=')) options.batchSize = Number(arg.slice(13));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return OptionsSchema.parse(options);
};

const SourceRowSchema = z.object({
  id: z.string().regex(/^[0-9]{1,19}$/),
  teamId: z.string().min(1),
  datasetId: z.string().min(1),
  collectionId: z.string().min(1),
  vector: z.string(),
  createTime: z.date(),
  text: z.string().nullable()
});

/** PG timestamp 按源连接的 TimeZone 显式解释；绝不使用运行脚本机器的时区猜测创建时间。 */
export const mapPgEmbeddingRow = (raw: unknown): DatasetDataEmbedding => {
  const { id, vector, ...fields } = SourceRowSchema.parse(raw);
  const document = DatasetDataEmbeddingSchema.parse({
    _id: id,
    vector: JSON.parse(vector),
    ...fields
  });
  assertMongoEmbeddingVector(document.vector);
  return document;
};

/** 保留源数据和目标已存在数据；同一 ID 内容冲突时失败，不覆盖迁移后可能产生的业务写入。 */
export const assertPgEmbeddingCopy = ({
  source,
  target
}: {
  source: DatasetDataEmbedding;
  target: DatasetDataEmbedding;
}): void => {
  if (
    source._id !== target._id ||
    source.teamId !== target.teamId ||
    source.datasetId !== target.datasetId ||
    source.collectionId !== target.collectionId ||
    source.createTime.getTime() !== target.createTime.getTime() ||
    source.text !== target.text ||
    source.vector.length !== target.vector.length ||
    source.vector.some((value, i) => value !== target.vector[i])
  ) {
    throw new Error(`Target embedding conflicts with PostgreSQL vector ID ${source._id}`);
  }
};

/**
 * 在一个稳定的 PG 快照中按主键分批复制并逐条核对；执行时 SHARE 锁阻止源表增删改。
 * 目标仅 setOnInsert，已提交批次可安全重放。最终数量、ID、归属、时间和每一维均须一致。
 */
export const migratePgEmbeddings = async ({
  source,
  execute,
  batchSize,
  onProgress = () => {}
}: z.infer<typeof OptionsSchema> & {
  source: Client;
  onProgress?: (progress: { scanned: number; total: number; cursor: string }) => void;
}) => {
  const target = MongoDatasetDataEmbedding;
  await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  try {
    if (execute) await source.query('LOCK TABLE public.modeldata IN SHARE MODE');
    const {
      rows: [summary]
    } = await source.query<{ total: string; timezone: string }>(
      "SELECT count(*)::text AS total, current_setting('TimeZone') AS timezone FROM public.modeldata"
    );
    const {
      rows: [columns]
    } = await source.query<{ has_text: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='modeldata' AND column_name='text') AS has_text"
    );
    const total = Number(summary.total);
    let scanned = 0;
    let inserted = 0;
    let cursor = '0';
    while (true) {
      const { rows } = await source.query(
        `SELECT id::text, team_id AS "teamId", dataset_id AS "datasetId", collection_id AS "collectionId",
          vector::text, createtime AT TIME ZONE current_setting('TimeZone') AS "createTime",
          ${columns.has_text ? 'text' : 'NULL::text'} AS text
         FROM public.modeldata WHERE modeldata.id > $1::bigint ORDER BY modeldata.id LIMIT $2`,
        [cursor, batchSize]
      );
      if (rows.length === 0) break;
      // 整个批次先完成校验，避免单个坏向量造成批次内部分写入。
      const documents = rows.map(mapPgEmbeddingRow);
      if (execute) {
        const result = await target.bulkWrite(
          documents.map((document) => ({
            updateOne: {
              filter: { _id: document._id },
              update: { $setOnInsert: document },
              upsert: true
            }
          }))
        );
        inserted += result.upsertedCount;
        const copied = await target.find({ _id: { $in: documents.map(({ _id }) => _id) } }).lean();
        const byId = new Map(
          copied.map((raw) => {
            const document = DatasetDataEmbeddingSchema.parse(raw);
            return [document._id, document] as const;
          })
        );
        for (const document of documents) {
          const targetDocument = byId.get(document._id);
          if (!targetDocument) throw new Error(`Missing copied embedding ID ${document._id}`);
          assertPgEmbeddingCopy({ source: document, target: targetDocument });
        }
      }
      scanned += documents.length;
      cursor = documents[documents.length - 1]._id;
      onProgress({ scanned, total, cursor });
    }
    if (scanned !== total)
      throw new Error('PostgreSQL source count differs from scanned embeddings');
    const targetCount = execute
      ? await target.countDocuments({ _id: { $regex: '^[0-9]{1,19}$' } })
      : undefined;
    if (execute && targetCount !== total)
      throw new Error('MongoDB migrated embedding count differs from PostgreSQL');
    await source.query('COMMIT');
    return {
      mode: execute ? 'execute' : 'dry-run',
      total,
      scanned,
      inserted,
      targetCount,
      sourceTimezone: summary.timezone
    };
  } catch (error) {
    await source.query('ROLLBACK');
    throw error;
  }
};

/** CLI 入口持有连接生命周期，迁移完成或失败后统一关闭独立连接。 */
export const runPgEmbeddingMigration = async (args: string[]): Promise<void> => {
  const options = parsePgEmbeddingMigrationOptions(args);
  if (!process.env.PG_URL || !process.env.EMBEDDING_MONGO_URL)
    throw new Error('PG_URL and EMBEDDING_MONGO_URL are required');
  const source = new pg.Client({
    connectionString: process.env.PG_URL,
    statement_timeout: 120_000
  });
  try {
    await source.connect();
    if (options.execute) await initEmbeddingMongo();
    else await connectEmbeddingMongo();
    console.log(
      JSON.stringify(
        await migratePgEmbeddings({
          source,
          ...options,
          onProgress: (progress) => console.log(JSON.stringify(progress))
        })
      )
    );
  } finally {
    await source.end();
    await embeddingMongo.disconnect();
  }
};
