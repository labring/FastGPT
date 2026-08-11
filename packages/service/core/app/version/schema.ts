import { defineIndex, connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { type AppVersionSchemaType } from '@fastgpt/global/core/app/version/type';
import { AppCollectionName, chatConfigType } from '../schema';
import { TeamMemberCollectionName } from '@fastgpt/global/support/user/team/constant';
import {
  decodeWorkflowNodesFromStorage,
  encodeWorkflowNodesForStorage
} from '../jsonSchemaStorage';

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
      set: encodeWorkflowNodesForStorage,
      get: decodeWorkflowNodesFromStorage,
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
    resourceRefs: {
      skillIds: {
        type: [String],
        default: []
      }
    }
  },
  {
    minimize: false
  }
);

AppVersionSchema.post(/^find/, (docs) => {
  if (Array.isArray(docs)) {
    docs.forEach((doc) => {
      doc.nodes = decodeWorkflowNodesFromStorage(doc.nodes);
    });
  } else if (docs) {
    docs.nodes = decodeWorkflowNodesFromStorage(docs.nodes);
  }
});

defineIndex(AppVersionSchema, { key: { appId: 1, time: -1 } });

export const MongoAppVersion = getMongoModel<AppVersionSchemaType>(
  AppVersionCollectionName,
  AppVersionSchema
);
