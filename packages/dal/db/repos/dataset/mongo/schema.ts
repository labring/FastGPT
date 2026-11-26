import type { ApiDatasetServerType } from '@fastgpt/global/core/dataset/apiDataset/type';
import { Schema } from 'mongoose';
import { defineMongoCollection } from '../../../mongo/collection';

export const DatasetCollectionName = 'datasets';

export type DatasetApiSyncMongoDoc = {
  _id: unknown;
  teamId: unknown;
  apiDatasetServer?: ApiDatasetServerType;
  collectionPermissionVersion?: number;
  collectionPermissionEnabled?: boolean;
  syncAll?: boolean;
  syncScopeVersion?: number;
};

const DatasetApiSyncMongoSchema = new Schema(
  {
    teamId: {
      type: Schema.Types.ObjectId,
      required: true
    },
    apiDatasetServer: {
      type: Schema.Types.Mixed
    },
    collectionPermissionVersion: {
      type: Number
    },
    collectionPermissionEnabled: {
      type: Boolean
    },
    syncAll: {
      type: Boolean
    },
    syncScopeVersion: {
      type: Number
    }
  },
  {
    versionKey: false,
    strict: false
  }
);

/**
 * Dataset API 同步窄视图 Mongo 集合声明（渐进迁移期使用独立 modelName，避免与旧 MongoDataset 抢占模型缓存）。
 */
export const datasetApiSyncMongoCollection = defineMongoCollection<DatasetApiSyncMongoDoc>({
  name: DatasetCollectionName,
  modelName: 'dal_dataset_api_sync',
  datasource: 'main',
  schema: DatasetApiSyncMongoSchema
});
