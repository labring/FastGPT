import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { Schema, getMongoModel } from '../../common/mongo';
import type { AppSchema as AppType } from '@fastgpt/global/core/app/type.d';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';

export const AppCollectionName = 'apps';

export const chatConfigType = {
  welcomeText: String,
  variables: Array,
  questionGuide: Object,
  ttsConfig: Object,
  whisperConfig: Object,
  scheduledTriggerConfig: Object,
  chatInputGuide: Object,
  fileSelectConfig: Object,
  instruction: String,
  autoExecute: Object
};

// schema
const AppSchema = new Schema(
  {
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
      default: AppTypeEnum.workflow,
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
    teamTags: {
      type: [String]
    },

    // save app(Not publish)
    modules: {
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
    // plugin config
    pluginData: {
      type: {
        nodeVersion: String,
        pluginUniId: String,
        apiSchemaStr: String, // http plugin
        customHeaders: String // http plugin
      }
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
    inheritPermission: {
      type: Boolean,
      default: true
    },

    // abandoned
    defaultPermission: Number
  },
  {
    minimize: false
  }
);

AppSchema.index({ type: 1 });
AppSchema.index({ teamId: 1, updateTime: -1 });
AppSchema.index({ teamId: 1, type: 1 });
AppSchema.index(
  { scheduledTriggerConfig: 1, scheduledTriggerNextTime: -1 },
  {
    partialFilterExpression: {
      scheduledTriggerConfig: { $exists: true }
    }
  }
);

export const MongoApp = getMongoModel<AppType>(AppCollectionName, AppSchema);
