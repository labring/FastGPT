import { Schema, model, models, Model } from 'mongoose';

const ImageSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'user',
    required: true
  },
  binary: {
    type: Buffer
  }
});

export const Image: Model<{ userId: string; binary: Buffer }> =
  models['image'] || model('image', ImageSchema);
