import { connectionMongo, getMongoModel, type Model } from '../../../common/mongo';
const { Schema, model, models } = connectionMongo;
import { type TeamTagSchema as TeamTagsSchemaType } from '@fastgpt/global/support/user/team/type';
import {
  TeamCollectionName,
  TeamTagsCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { getLogger, LogCategories } from '../../../common/logger';

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
  const logger = getLogger(LogCategories.INFRA.MONGO);
  logger.error('Failed to build team tag indexes', { error });
}

export const MongoTeamTags = getMongoModel<TeamTagsSchemaType>(
  TeamTagsCollectionName,
  TeamTagSchema
);
