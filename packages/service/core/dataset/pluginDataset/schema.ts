import { connectionMongo, getMongoModel } from '../../../common/mongo/index';
const { Schema } = connectionMongo;

export const collectionName = 'system_plugin_datasets';

// status: 0 = 关闭, 1 = 开启
export type SystemPluginDatasetSchemaType = {
  _id: string;
  sourceId: string;
  status: number;
};

const SystemPluginDatasetSchema = new Schema({
  sourceId: {
    type: String,
    required: true,
    unique: true
  },
  status: {
    type: Number,
    default: 1
  }
});

SystemPluginDatasetSchema.index({ sourceId: 1 }, { unique: true });

export const MongoSystemPluginDataset = getMongoModel<SystemPluginDatasetSchemaType>(
  collectionName,
  SystemPluginDatasetSchema
);
