import { connectionMongo, getMongoModel, type Model } from '../../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { TeamTagSchema as TeamTagsSchemaType } from '@fastgpt/global/support/user/team/type.d';
import {
  TeamCollectionName,
  TeamTagsCollectionName
} from '@fastgpt/global/support/user/team/constant';

const TeamTagSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  key: {
    type: String,
    required: true
  },
  label: {
    type: String,
    required: true
  },
  createTime: {
    type: Date,
    default: () => new Date()
  }
});

try {
  TeamTagSchema.index({ teamId: 1 });
} catch (error) {
  console.log(error);
}

export const MongoTeamTags = getMongoModel<TeamTagsSchemaType>(
  TeamTagsCollectionName,
  TeamTagSchema
);
