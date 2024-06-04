import { connectionMongo, type Model } from '../../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { TeamSchema as TeamType } from '@fastgpt/global/support/user/team/type.d';
import { userCollectionName } from '../../user/schema';
import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { TeamDefaultPermissionVal } from '@fastgpt/global/support/permission/user/constant';

const TeamSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  ownerId: {
    type: Schema.Types.ObjectId,
    ref: userCollectionName
  },
  defaultPermission: {
    type: Number,
    default: TeamDefaultPermissionVal
  },
  avatar: {
    type: String,
    default: '/icon/logo.svg'
  },
  createTime: {
    type: Date,
    default: () => Date.now()
  },
  balance: {
    type: Number,
    default: 0
  },
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
  }
});

try {
  TeamSchema.index({ name: 1 });
  TeamSchema.index({ ownerId: 1 });
} catch (error) {
  console.log(error);
}

export const MongoTeam: Model<TeamType> =
  models[TeamCollectionName] || model(TeamCollectionName, TeamSchema);
