import { connectionMongo, type Model } from '@fastgpt/service/common/mongo';
const { Schema, model, models } = connectionMongo;

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
