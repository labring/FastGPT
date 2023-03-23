import { Schema, model, models } from 'mongoose';

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
  }
});

export const Data = models['data'] || model('data', DataSchema);
