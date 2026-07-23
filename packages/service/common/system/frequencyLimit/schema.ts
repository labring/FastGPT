import { defineIndex, getMongoModel, Schema } from '../../mongo';
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

defineIndex(FrequencyLimitSchema, { key: { eventId: 1, expiredTime: 1 } });
defineIndex(FrequencyLimitSchema, {
  key: { expiredTime: 1 },
  options: { expireAfterSeconds: 0 }
});

export const MongoFrequencyLimit = getMongoModel<FrequencyLimitSchemaType>(
  'frequency_limit',
  FrequencyLimitSchema
);
