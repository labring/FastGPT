import { getMongoModel, Schema } from '../../mongo';
import type { FrequencyLimitSchemaType } from './type';

const FrequencyLimitSchema = new Schema({
  eventId: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    default: 0
  },
  expiredTime: {
    type: Date,
    required: true
  }
});

try {
  FrequencyLimitSchema.index({ eventId: 1, expiredTime: 1 });
  FrequencyLimitSchema.index({ expiredTime: 1 }, { expireAfterSeconds: 0 });
} catch (error) {}

export const MongoFrequencyLimit = getMongoModel<FrequencyLimitSchemaType>(
  'frequency_limit',
  FrequencyLimitSchema
);
