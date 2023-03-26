import { Schema, model, models, Model } from 'mongoose';
import { DataSchema as Datatype } from '@/types/mongoSchema';
import { DataTypeTextMap } from '@/constants/data';

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
  type: {
    type: String,
    required: true,
    enum: Object.keys(DataTypeTextMap)
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
});

export const Data: Model<Datatype> = models['data'] || model('data', DataSchema);
