import { AppTypeEnum, AppTypeMap } from '@fastgpt/global/core/app/constants';
import { connectionMongo, type Model } from '../../common/mongo';
const { Schema, model, models } = connectionMongo;
import type { AppSchema as AppType } from '@fastgpt/global/core/app/type.d';
import { PermissionTypeEnum, PermissionTypeMap } from '@fastgpt/global/support/permission/constant';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { AppDefaultPermissionVal } from '@fastgpt/global/support/permission/app/constant';

export const AppCollectionName = 'apps';

export const chatConfigType = {
  welcomeText: String,
  variables: Array,
  questionGuide: Boolean,
  ttsConfig: Object,
  whisperConfig: Object,
  scheduledTriggerConfig: Object,
  chatInputGuide: Object
};

const AppSchema = new Schema({
  parentId: {
    type: Schema.Types.ObjectId,
    ref: AppCollectionName,
    default: null
  },
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
    default: AppTypeEnum.advanced,
    enum: Object.values(AppTypeEnum)
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

  // role and auth
  permission: {
    type: String,
    enum: Object.keys(PermissionTypeMap),
    default: PermissionTypeEnum.private
  },
  teamTags: {
    type: [String]
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
  chatConfig: {
    type: chatConfigType,
    default: {}
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

  // the default permission of a app
  defaultPermission: {
    type: Number,
    default: AppDefaultPermissionVal
  }
});

try {
  AppSchema.index({ updateTime: -1 });
  AppSchema.index({ teamId: 1, type: 1 });
  AppSchema.index({ scheduledTriggerConfig: 1, intervalNextTime: -1 });
} catch (error) {
  console.log(error);
}

export const MongoApp: Model<AppType> =
  models[AppCollectionName] || model(AppCollectionName, AppSchema);

MongoApp.syncIndexes();
