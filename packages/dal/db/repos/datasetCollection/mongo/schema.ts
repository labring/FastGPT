import { Schema } from 'mongoose';
import { defineMongoCollection } from '../../../mongo/collection';

export const DatasetColCollectionName = 'dataset_collections';

export type DatasetCollectionApiSyncMongoDoc = {
  _id: unknown;
  teamId: unknown;
  datasetId: unknown;
  parentId?: unknown;
  type?: string;
  apiFileId?: string | null;
  apiFileParentId?: string | null;
  inheritPermission?: boolean;
  syncChildren?: boolean;
};

const DatasetCollectionApiSyncMongoSchema = new Schema(
  {
    teamId: {
      type: Schema.Types.ObjectId,
      required: true
    },
    datasetId: {
      type: Schema.Types.ObjectId,
      required: true
    },
    parentId: {
      type: Schema.Types.ObjectId
    },
    type: {
      type: String
    },
    apiFileId: {
      type: String
    },
    apiFileParentId: {
      type: String
    },
    inheritPermission: {
      type: Boolean
    },
    syncChildren: {
      type: Boolean
    }
  },
  {
    versionKey: false,
    strict: false
  }
);

/**
 * DatasetCollection API 同步窄视图 Mongo 集合声明（渐进迁移期使用独立 modelName，避免与旧 MongoDatasetCollection 抢占模型缓存）。
 */
export const datasetCollectionApiSyncMongoCollection =
  defineMongoCollection<DatasetCollectionApiSyncMongoDoc>({
    name: DatasetColCollectionName,
    modelName: 'dal_dataset_collection_api_sync',
    datasource: 'main',
    schema: DatasetCollectionApiSyncMongoSchema
  });
