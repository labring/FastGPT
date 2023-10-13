import { connectionMongo, type Model } from '@fastgpt/common/mongo';
const { Schema, model, models } = connectionMongo;
import { DatasetSchemaType } from './type';
import { DatasetTypeMap } from './constant';

const DatasetSchema = new Schema({
  parentId: {
    type: Schema.Types.ObjectId,
    ref: 'kb',
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

export const MongoDataset: Model<DatasetSchemaType> = models['kb'] || model('kb', DatasetSchema);
