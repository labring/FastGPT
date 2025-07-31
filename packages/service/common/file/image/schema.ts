import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { Schema, getMongoModel } from '../../mongo';
import { type MongoImageSchemaType } from '@fastgpt/global/common/file/image/type.d';

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
  expiredTime: Date,
  binary: Buffer,
  metadata: Object
});

try {
  // tts expired（60 Minutes）
  ImageSchema.index({ expiredTime: 1 }, { expireAfterSeconds: 60 * 60 });
  ImageSchema.index({ type: 1 });
  // delete related img
  ImageSchema.index({ teamId: 1, 'metadata.relatedId': 1 });

  // Cron clear invalid img
  ImageSchema.index(
    { createTime: 1 },
    { partialFilterExpression: { 'metadata.relatedId': { $exists: true } } }
  );
} catch (error) {
  console.log(error);
}

export const MongoImage = getMongoModel<MongoImageSchemaType>('image', ImageSchema);
