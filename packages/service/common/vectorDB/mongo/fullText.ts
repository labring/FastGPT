import { mongo } from 'mongoose';
import { SqlFullTextMetadataSchema } from '@fastgpt/global/core/dataset/fullText/schema';
import {
  SQL_FULL_TEXT_ANALYZER_VERSION,
  SQL_FULL_TEXT_SCHEMA_VERSION
} from '@fastgpt/global/core/dataset/fullText/constants';
import { toSqlFullTextQueryTerms } from '../fullText/analyzer';
import type { NativeFullTextAdapter, SqlFullTextHit } from '../fullText/type';
import { normalizeSqlFullTextScope, SqlFullTextDataError } from '../fullText/utils';
import { connectEmbeddingMongo } from './controller';
import {
  assertMongoFullTextIndex,
  ensureMongoFullTextIndex,
  MongoFullTextSearchIndexName
} from './fullTextIndex';
import { embeddingMongo, MongoDatasetDataEmbedding } from './schema';
import { toMongoFullTextTokens } from './utils';

/** MongoDB 向量 ID 是字符串，早于全文迁移创建的行也使用此契约。 */
export const assertMongoFullTextVectorId = (id: string) => {
  if (typeof id !== 'string' || !id.length) {
    throw new SqlFullTextDataError('MongoDB full-text vector ID must be a non-empty string');
  }
};

/** Mongo 原生全文与向量同行，旧 text 及业务库旧全文集合不参与切读后的查询。 */
export const mongoFullTextAdapter: NativeFullTextAdapter<'mongo'> = {
  provider: 'mongo',
  async prepare({ signal } = {}) {
    signal?.throwIfAborted();
    await connectEmbeddingMongo();
    await ensureMongoFullTextIndex();
    signal?.throwIfAborted();
    return this.getMetadata();
  },
  assertCapability: assertMongoFullTextIndex,
  async getMetadata() {
    const db = embeddingMongo.connection.db;
    if (!db) throw new Error('MongoDB embedding connection is unavailable');
    const [collection] = await db
      .listCollections({
        name: MongoDatasetDataEmbedding.collection.collectionName
      })
      .toArray();
    const uuid = collection && 'info' in collection ? collection.info?.uuid : undefined;
    if (!(uuid instanceof mongo.Binary))
      throw new Error('MongoDB embedding collection UUID is unavailable');
    return SqlFullTextMetadataSchema.parse({
      targetId: uuid.toUUID().toHexString(),
      schemaVersion: SQL_FULL_TEXT_SCHEMA_VERSION,
      analyzerVersion: SQL_FULL_TEXT_ANALYZER_VERSION
    });
  },
  async fill(rows, validateOnly = false) {
    const expected = await Promise.all(
      rows.map(async ({ text, ...row }) => {
        assertMongoFullTextVectorId(row.vectorId);
        return { ...row, tokens: await toMongoFullTextTokens(text) };
      })
    );
    const invalid: string[] = [];
    for (let start = 0; start < expected.length; start += 50) {
      const chunk = expected.slice(start, start + 50);
      // NULL 及缺字段表示未回填；已有值即使冲突也保留，供校验报告。
      if (!validateOnly) {
        await MongoDatasetDataEmbedding.bulkWrite(
          chunk.map(({ vectorId, tokens, ...scope }) => ({
            updateOne: {
              filter: { _id: vectorId, ...scope, fulltextTokens: null },
              update: { $set: { fulltextTokens: tokens } },
              collation: { locale: 'simple' }
            }
          })),
          { ordered: false }
        );
      }
      const existing = await MongoDatasetDataEmbedding.find({
        _id: { $in: chunk.map(({ vectorId }) => vectorId) }
      })
        .collation({ locale: 'simple' })
        .select('_id teamId datasetId collectionId fulltextTokens')
        .read('primary')
        .lean();
      const byId = new Map(existing.map((row) => [row._id, row]));
      for (const row of chunk) {
        const actual = byId.get(row.vectorId);
        if (
          !actual ||
          actual.teamId !== row.teamId ||
          actual.datasetId !== row.datasetId ||
          actual.collectionId !== row.collectionId ||
          actual.fulltextTokens !== row.tokens
        ) {
          invalid.push(row.vectorId);
        }
      }
    }
    return invalid;
  },
  async findMissingVectorIds(ids) {
    ids.forEach(assertMongoFullTextVectorId);
    const existing = await MongoDatasetDataEmbedding.find({ _id: { $in: ids } })
      .collation({ locale: 'simple' })
      .select('_id')
      .read('primary')
      .lean();
    const found = new Set(existing.map(({ _id }) => _id));
    return ids.filter((id) => !found.has(id));
  },
  async search(input) {
    const props = normalizeSqlFullTextScope(input);
    const allowed = props.filterCollectionIdList?.filter(
      (id) => !props.forbidCollectionIdList.includes(id)
    );
    if (props.limit <= 0 || !props.datasetIds.length || allowed?.length === 0) return [];
    const terms = await toSqlFullTextQueryTerms(props.query);
    if (!terms.length) return [];
    await connectEmbeddingMongo();
    // MongoDB Search 在索引缺失时可能返回空结果，先核验就绪状态以区分正常无命中。
    await assertMongoFullTextIndex();
    const datasetIds = [...new Set(props.datasetIds)];
    const denied = allowed ? [] : props.forbidCollectionIdList;
    return MongoDatasetDataEmbedding.aggregate<SqlFullTextHit>([
      {
        $search: {
          index: MongoFullTextSearchIndexName,
          compound: {
            must: [
              { text: { path: 'fulltextTokens', query: terms.join(' '), matchCriteria: 'any' } }
            ],
            filter: [
              { equals: { path: 'teamId', value: props.teamId } },
              { in: { path: 'datasetId', value: datasetIds } },
              ...(allowed ? [{ in: { path: 'collectionId', value: allowed } }] : [])
            ],
            ...(denied.length && { mustNot: [{ in: { path: 'collectionId', value: denied } }] })
          },
          sort: { score: { $meta: 'searchScore' }, _id: 1 }
        }
      },
      {
        // mongot 异步更新，返回候选前按主库当前的团队、知识库和集合再次核对访问范围。
        $match: {
          teamId: props.teamId,
          datasetId: { $in: datasetIds },
          ...(allowed && { collectionId: { $in: allowed } }),
          ...(denied.length && { collectionId: { $nin: denied } })
        }
      },
      { $limit: props.limit },
      { $project: { _id: 0, vectorId: '$_id', collectionId: 1, score: { $meta: 'searchScore' } } }
    ])
      .collation({ locale: 'simple' })
      .read('primary')
      .exec();
  }
};
