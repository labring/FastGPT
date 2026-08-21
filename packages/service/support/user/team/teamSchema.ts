import { defineIndex, connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { type TeamSchema as TeamType } from '@fastgpt/global/support/user/team/type';
import { userCollectionName } from '../../user/schema';
import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';

const TeamSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  ownerId: {
    type: Schema.Types.ObjectId,
    ref: userCollectionName
  },
  avatar: {
    type: String,
    default: '/icon/logo.svg'
  },
  createTime: {
    type: Date,
    default: () => Date.now()
  },
  balance: Number,
  limit: {
    lastExportDatasetTime: {
      type: Date
    },
    lastWebsiteSyncTime: {
      type: Date
    }
  },
  openaiAccount: {
    type: {
      key: String,
      baseUrl: String
    }
  },
  externalWorkflowVariables: {
    type: Object,
    default: {}
  },
  notificationAccount: {
    type: String,
    required: false
  },
  meta: {
    type: Object
  },
  deleteTime: {
    type: Date
  }
});

defineIndex(TeamSchema, { key: { name: 1 } });
defineIndex(TeamSchema, { key: { ownerId: 1 } });
defineIndex(TeamSchema, {
  key: { 'meta.wecom.corpId': 1 },
  options: { sparse: true, unique: true }
});

export const MongoTeam = getMongoModel<TeamType>(TeamCollectionName, TeamSchema);
