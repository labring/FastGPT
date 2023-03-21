import { Schema, model, models } from 'mongoose';

const PaySchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  time: {
    type: Number,
    default: () => Date.now()
  },
  price: {
    type: Number,
    required: true
  },
  orderId: {
    type: String,
    required: true
  }
});

export const Pay = models['pay'] || model('pay', PaySchema);
