import { connectionMongo, type Model } from '../../mongo';
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

export const MongoImage: Model<{ userId: string; binary: Buffer }> =
  models['image'] || model('image', ImageSchema);
