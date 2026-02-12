import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import type { UsageItemSchemaType } from '@fastgpt/global/support/wallet/usage/type';
import { UsageCollectionName, UsageItemCollectionName } from './constants';
import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { getLogger, LogCategories } from '../../../common/logger';

const UsageItemSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  usageId: {
    type: Schema.Types.ObjectId,
    ref: UsageCollectionName,
    required: true
  },
  name: {
    // usage name
    type: String,
    required: true
  },
  amount: {
    type: Number,
    default: 0
  },
  itemType: Number,
  time: {
    type: Date,
    default: () => new Date()
  },

  // Params
  inputTokens: Number,
  outputTokens: Number,
  charsLength: Number,
  duration: Number,
  pages: Number,
  count: Number,
  model: String
});

try {
  UsageItemSchema.index({ usageId: 'hashed' });
  UsageItemSchema.index({ time: 1 }, { expireAfterSeconds: 360 * 24 * 60 * 60 });
} catch (error) {
  const logger = getLogger(LogCategories.INFRA.MONGO);
  logger.error('Failed to build usage item indexes', { error });
}

export const MongoUsageItem = getMongoModel<UsageItemSchemaType>(
  UsageItemCollectionName,
  UsageItemSchema
);
