import { connectionMongo, getMongoModel, type Model } from '../../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { type AppVersionSchemaType } from '@fastgpt/global/core/app/version';
import { chatConfigType } from '../schema';
import { TeamMemberCollectionName } from '@fastgpt/global/support/user/team/constant';

export const AppVersionCollectionName = 'app_versions';

const AppVersionSchema = new Schema(
  {
    tmbId: {
      type: String,
      ref: TeamMemberCollectionName,
      required: true
    },
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
    isPublish: Boolean,
    versionName: String
  },
  {
    minimize: false
  }
);

try {
  AppVersionSchema.index({ appId: 1, time: -1 });
} catch (error) {
  console.log(error);
}

export const MongoAppVersion = getMongoModel<AppVersionSchemaType>(
  AppVersionCollectionName,
  AppVersionSchema
);
