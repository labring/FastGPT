import { connectionMongo, type Model } from '../../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { TeamSchema as TeamType } from '@fastgpt/global/support/user/team/type.d';
import { userCollectionName } from '../../user/schema';
import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { PRICE_SCALE } from '@fastgpt/global/support/wallet/bill/constants';

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
  balance: {
    type: Number,
    default: 2 * PRICE_SCALE
  },
  maxSize: {
    type: Number,
    default: 5
  },
  limit: {
    lastExportDatasetTime: {
      type: Date
    },
    lastWebsiteSyncTime: {
      type: Date
    }
  }
});

try {
  TeamSchema.index({ lastDatasetBillTime: -1 });
} catch (error) {
  console.log(error);
}

export const MongoTeam: Model<TeamType> =
  models[TeamCollectionName] || model(TeamCollectionName, TeamSchema);
