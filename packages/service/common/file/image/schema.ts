import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, type Model } from '../../mongo';
const { Schema, model, models } = connectionMongo;

const ImageSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName
  },
  binary: {
    type: Buffer
  },
  expiredTime: {
    type: Date
  }
});

try {
  ImageSchema.index({ expiredTime: 1 }, { expireAfterSeconds: 60 });
} catch (error) {
  console.log(error);
}

export const MongoImage: Model<{ teamId: string; binary: Buffer }> =
  models['image'] || model('image', ImageSchema);

MongoImage.syncIndexes();
