import { connectionMongo, getMongoModel, type Model } from '../../../common/mongo';
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
  },
  isPublish: {
    type: Boolean
  },
  versionName: {
    type: String,
    default: ''
  },
  tmbId: {
    type: String
  }
});

try {
  AppVersionSchema.index({ appId: 1, time: -1 });
} catch (error) {
  console.log(error);
}

export const MongoAppVersion = getMongoModel<AppVersionSchemaType>(
  AppVersionCollectionName,
  AppVersionSchema
);
