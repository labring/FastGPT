import { connectionMongo, type Model } from '../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { DatasetSchemaType } from '@fastgpt/global/core/dataset/type.d';
import { DatasetTypeMap } from '@fastgpt/global/core/dataset/constant';

export const DatasetCollectionName = 'datasets';

const DatasetSchema = new Schema({
  parentId: {
    type: Schema.Types.ObjectId,
    ref: DatasetCollectionName,
    default: null
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  avatar: {
    type: String,
    default: '/icon/logo.svg'
  },
  name: {
    type: String,
    required: true
  },
  vectorModel: {
    type: String,
    required: true,
    default: 'text-embedding-ada-002'
  },
  type: {
    type: String,
    enum: Object.keys(DatasetTypeMap),
    required: true,
    default: 'dataset'
  },
  tags: {
    type: [String],
    default: []
  }
});

try {
  DatasetSchema.index({ userId: 1 });
} catch (error) {
  console.log(error);
}

export const MongoDataset: Model<DatasetSchemaType> =
  models[DatasetCollectionName] || model(DatasetCollectionName, DatasetSchema);
