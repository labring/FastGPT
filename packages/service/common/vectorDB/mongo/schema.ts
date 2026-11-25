import { Mongoose, Schema, type Model } from 'mongoose';
import type { DatasetDataEmbedding } from '@fastgpt/global/core/dataset/data/embedding/type';
import { defineIndex } from '../../mongo/schemaIndexes';
import { DatasetEmbeddingCollectionName } from '../constants';

// 独立连接允许向量库与业务库部署在不同集群，且避免 Next.js 热更新重复建立连接。
export const embeddingMongo = (global.embeddingMongo ??= new Mongoose());

export const DatasetDataEmbeddingMongoSchema = new Schema<DatasetDataEmbedding>(
  {
    _id: { type: String, required: true },
    teamId: { type: String, required: true },
    datasetId: { type: String, required: true },
    collectionId: { type: String, required: true },
    vector: { type: [Number], required: true },
    createTime: { type: Date, required: true },
    text: String,
    fulltextTokens: String
  },
  { autoIndex: false, autoCreate: false, versionKey: false }
);

// 普通索引服务于范围查询与孤儿清理；mongot 的索引单独管理。
defineIndex(DatasetDataEmbeddingMongoSchema, { key: { teamId: 1, datasetId: 1, collectionId: 1 } });
defineIndex(DatasetDataEmbeddingMongoSchema, { key: { createTime: 1 } });

export const MongoDatasetDataEmbedding: Model<DatasetDataEmbedding> =
  embeddingMongo.models[DatasetEmbeddingCollectionName] ??
  embeddingMongo.model<DatasetDataEmbedding>(
    DatasetEmbeddingCollectionName,
    DatasetDataEmbeddingMongoSchema,
    DatasetEmbeddingCollectionName
  );
