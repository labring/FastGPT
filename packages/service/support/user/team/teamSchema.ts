import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { type TeamSchema as TeamType } from '@fastgpt/global/support/user/team/type';
import { userCollectionName } from '../../user/schema';
import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { getLogger, LogCategories } from '../../../common/logger';

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
  teamDomain: {
    type: String
  },
  limit: {
    lastExportDatasetTime: {
      type: Date
    },
    lastWebsiteSyncTime: {
      type: Date
    }
  },
  lafAccount: {
    token: {
      type: String
    },
    appid: {
      type: String
    },
    pat: {
      type: String
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

try {
  TeamSchema.index({ name: 1 });
  TeamSchema.index({ ownerId: 1 });
  TeamSchema.index({ 'meta.wecom.corpId': 1 }, { sparse: true, unique: true });
} catch (error) {
  const logger = getLogger(LogCategories.INFRA.MONGO);
  logger.error('Failed to build team indexes', { error });
}

export const MongoTeam = getMongoModel<TeamType>(TeamCollectionName, TeamSchema);
