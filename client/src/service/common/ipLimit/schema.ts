import { Schema, model, models, Model } from 'mongoose';
import type { IpLimitSchemaType } from '@/types/common/ipLimit';

const IpLimitSchema = new Schema({
  eventId: {
    type: String,
    required: true
  },
  ip: {
    type: String,
    required: true
  },
  account: {
    type: Number,
    default: 0
  },
  lastMinute: {
    type: Date,
    default: () => new Date()
  }
});

export const IpLimit: Model<IpLimitSchemaType> =
  models['ip_limit'] || model('ip_limit', IpLimitSchema);
