import { AppTypeMap } from '@fastgpt/global/core/app/constants';
import { connectionMongo, type Model } from '../../common/mongo';
const { Schema, model, models } = connectionMongo;
import type { AppSchema as AppType } from '@fastgpt/global/core/app/type.d';
import { PermissionTypeEnum, PermissionTypeMap } from '@fastgpt/global/support/permission/constant';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';

export const AppCollectionName = 'apps';

const AppSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  type: {
    type: String,
    default: 'advanced',
    enum: Object.keys(AppTypeMap)
  },
  version: {
    type: String,
    enum: ['v1', 'v2']
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

  // tmp store
  modules: {
    type: Array,
    default: []
  },
  edges: {
    type: Array,
    default: []
  },

  scheduledTriggerConfig: {
    cronString: {
      type: String
    },
    timezone: {
      type: String
    },
    defaultPrompt: {
      type: String
    }
  },
  scheduledTriggerNextTime: {
    type: Date
  },

  inited: {
    type: Boolean
  },
  permission: {
    type: String,
    enum: Object.keys(PermissionTypeMap),
    default: PermissionTypeEnum.private
  },
  teamTags: {
    type: [String]
  }
});

try {
  AppSchema.index({ updateTime: -1 });
  AppSchema.index({ teamId: 1 });
  AppSchema.index({ scheduledTriggerConfig: 1, intervalNextTime: -1 });
} catch (error) {
  console.log(error);
}

export const MongoApp: Model<AppType> =
  models[AppCollectionName] || model(AppCollectionName, AppSchema);

MongoApp.syncIndexes();
