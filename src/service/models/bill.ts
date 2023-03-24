import { Schema, model, models } from 'mongoose';
import { modelList } from '@/constants/model';

const BillSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  type: {
    type: String,
    enum: ['chat', 'generateData', 'return'],
    required: true
  },
  modelName: {
    type: String,
    enum: modelList.map((item) => item.model),
    required: true
  },
  chatId: {
    type: Schema.Types.ObjectId,
    ref: 'chat',
    required: true
  },
  time: {
    type: Date,
    default: () => new Date()
  },
  textLen: {
    // 提示词+响应的总字数
    type: Number,
    required: true
  },
  price: {
    type: Number,
    required: true
  }
});

export const Bill = models['bill'] || model('bill', BillSchema);
