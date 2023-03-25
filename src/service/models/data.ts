import { Schema, model, models, Model } from 'mongoose';
import { DataItemSchema as Datatype } from '@/types/mongoSchema';

const DataSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
});

export const Data: Model<Datatype> = models['data'] || model('data', DataSchema);
