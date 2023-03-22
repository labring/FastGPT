import { Schema, model, models } from 'mongoose';

const PaySchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  price: {
    type: Number,
    required: true
  },
  orderId: {
    type: String,
    required: true
  },
  status: {
    // 支付的状态
    type: String,
    default: 'NOTPAY',
    enum: ['SUCCESS', 'REFUND', 'NOTPAY', 'CLOSED']
  }
});

export const Pay = models['pay'] || model('pay', PaySchema);
