import { connectionMongo, type Model } from '../../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { BillSchema as BillType } from '@fastgpt/global/support/wallet/bill/type';
import { BillSourceMap } from '@fastgpt/global/support/wallet/bill/constants';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';

const BillSchema = new Schema({
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
  appName: {
    type: String,
    default: ''
  },
  appId: {
    type: Schema.Types.ObjectId,
    ref: 'apps',
    required: false
  },
  time: {
    type: Date,
    default: () => new Date()
  },
  total: {
    // 1 * PRICE_SCALE
    type: Number,
    required: true
  },
  source: {
    type: String,
    enum: Object.keys(BillSourceMap),
    required: true
  },
  list: {
    type: Array,
    default: []
  }
});

try {
  BillSchema.index({ teamId: 1, tmbId: 1, source: 1, time: -1 }, { background: true });
  BillSchema.index({ time: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });
} catch (error) {
  console.log(error);
}

export const MongoBill: Model<BillType> = models['bill'] || model('bill', BillSchema);
MongoBill.syncIndexes();
