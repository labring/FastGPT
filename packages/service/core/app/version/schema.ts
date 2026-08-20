import { defineIndex, connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { type AppVersionSchemaType } from '@fastgpt/global/core/app/version/type';
import { AppCollectionName } from '../schema';
import { TeamMemberCollectionName } from '@fastgpt/global/support/user/team/constant';

export const AppVersionCollectionName = 'app_versions';

const chatConfigType = {
  welcomeText: String,
  welcomeConfig: Object,
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
    versionName: String,
    resources: {
      type: Array
    },
    /** @deprecated 仅供 4.16.3 资源快照迁移读取 skillIds */
    resourceRefs: {
      type: Object,
      default: undefined
    }
  },
  {
    minimize: false
  }
);

defineIndex(AppVersionSchema, { key: { appId: 1, time: -1 } });
defineIndex(AppVersionSchema, {
  key: { appId: 1, 'resources.type': 1, 'resources.id': 1 }
});

export const MongoAppVersion = getMongoModel<AppVersionSchemaType>(
  AppVersionCollectionName,
  AppVersionSchema
);
