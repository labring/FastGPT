import { connectionMongo, type Model } from '../../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { TeamTagsSchema as TeamTagsSchemaType } from '@fastgpt/global/support/user/team/type.d';
import {
  TeamCollectionName,
  TeamTagsCollectionName
} from '@fastgpt/global/support/user/team/constant';

const TeamTagsSchema = new Schema({
  label: {
    type: String,
    required: true
  },
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  key: {
    type: String
  },
  createTime: {
    type: Date,
    default: () => new Date()
  }
});

try {
  TeamTagsSchema.index({ teamId: 1 });
} catch (error) {
  console.log(error);
}

export const MongoTeamTags: Model<TeamTagsSchemaType> =
  models[TeamTagsCollectionName] || model(TeamTagsCollectionName, TeamTagsSchema);
