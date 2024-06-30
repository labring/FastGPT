import { connectionMongo, type Model } from '../../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { AppVersionSchemaType } from '@fastgpt/global/core/app/version';
import { chatConfigType } from '../schema';

export const AppVersionCollectionName = 'app_versions';

const AppVersionSchema = new Schema({
  appId: {
    type: Schema.Types.ObjectId,
    ref: AppVersionCollectionName,
    required: true
  },
  time: {
    type: Date,
    default: () => new Date()
  },
  nodes: {
    type: Array,
    default: []
  },
  edges: {
    type: Array,
    default: []
  },
  chatConfig: {
    type: chatConfigType
  }
});

try {
  AppVersionSchema.index({ appId: 1, time: -1 });
} catch (error) {
  console.log(error);
}

export const MongoAppVersion: Model<AppVersionSchemaType> =
  models[AppVersionCollectionName] || model(AppVersionCollectionName, AppVersionSchema);

MongoAppVersion.syncIndexes();
