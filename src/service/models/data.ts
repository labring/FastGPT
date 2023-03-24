import { Schema, model, models } from 'mongoose';

const DataSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  docId: {
    type: String,
    required: true
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  q: {
    type: String,
    required: true
  },
  a: {
    type: String,
    required: true
  }
});

export const Data = models['data'] || model('data', DataSchema);
