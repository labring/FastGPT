import { connectionMongo, type Model } from '../../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { subModeMap, subStatusMap, subTypeMap } from '@fastgpt/global/support/wallet/sub/constants';
import type { TeamSubSchema } from '@fastgpt/global/support/wallet/sub/type';

export const subCollectionName = 'team.subscription';

const SubSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  type: {
    type: String,
    enum: Object.keys(subTypeMap),
    required: true
  },
  mode: {
    type: String,
    enum: Object.keys(subModeMap),
    required: true
  },
  status: {
    type: String,
    enum: Object.keys(subStatusMap),
    required: true
  },
  renew: {
    type: Boolean,
    default: true
  },
  startTime: {
    type: Date
  },
  expiredTime: {
    type: Date
  },
  datasetStoreAmount: {
    type: Number
  }
});

try {
  SubSchema.index({ teamId: 1 });
  SubSchema.index({ status: 1 });
  SubSchema.index({ type: 1 });
  SubSchema.index({ expiredTime: -1 });
} catch (error) {
  console.log(error);
}

export const MongoTeamSub: Model<TeamSubSchema> =
  models[subCollectionName] || model(subCollectionName, SubSchema);
