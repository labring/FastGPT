import { connectionMongo, type Model } from '../../common/mongo';
const { Schema, model, models } = connectionMongo;
import type { FlowModuleItemSchema } from '@fastgpt/global/core/module/type.d';

export const ModuleCollectionName = 'modules';

const DatasetSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  avatar: {
    type: String,
    default: '/icon/logo.svg'
  },
  intro: {
    type: String,
    default: ''
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  },
  modules: {
    type: Array,
    default: []
  }
});

try {
  DatasetSchema.index({ userId: 1 });
} catch (error) {
  console.log(error);
}

export const MongoModule: Model<FlowModuleItemSchema> =
  models[ModuleCollectionName] || model(ModuleCollectionName, DatasetSchema);
