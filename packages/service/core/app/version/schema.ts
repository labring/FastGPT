import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { type AppVersionSchemaType } from '@fastgpt/global/core/app/version';
import { AppCollectionName, chatConfigType } from '../schema';
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
      ref: AppCollectionName,
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
    isAutoSave: Boolean,
    versionName: String
  },
  {
    minimize: false
  }
);

AppVersionSchema.index({ appId: 1, time: -1 });

export const MongoAppVersion = getMongoModel<AppVersionSchemaType>(
  AppVersionCollectionName,
  AppVersionSchema
);
