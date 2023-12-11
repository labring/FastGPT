import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, type Model } from '../../mongo';
const { Schema, model, models } = connectionMongo;

const ImageSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  binary: {
    type: Buffer
  },
  expiredTime: {
    type: Date
  },
  metadata: {
    type: Object
  }
});

try {
  ImageSchema.index({ expiredTime: 1 }, { expireAfterSeconds: 60 });
} catch (error) {
  console.log(error);
}

export const MongoImage: Model<{
  teamId: string;
  binary: Buffer;
  metadata?: { fileId?: string };
}> = models['image'] || model('image', ImageSchema);

MongoImage.syncIndexes();
