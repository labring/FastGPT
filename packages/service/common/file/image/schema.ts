import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, getMongoModel, type Model } from '../../mongo';
import { MongoImageSchemaType } from '@fastgpt/global/common/file/image/type.d';
import { mongoImageTypeMap } from '@fastgpt/global/common/file/image/constants';
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
  expiredTime: {
    type: Date
  },
  binary: {
    type: Buffer
  },
  type: {
    type: String,
    enum: Object.keys(mongoImageTypeMap),
    required: true
  },
  metadata: {
    type: Object
  }
});

try {
  // tts expired（60 Minutes）
  ImageSchema.index({ expiredTime: 1 }, { expireAfterSeconds: 60 * 60 });
  ImageSchema.index({ type: 1 });
  ImageSchema.index({ createTime: 1 });
  // delete related img
  ImageSchema.index({ teamId: 1, 'metadata.relatedId': 1 });
} catch (error) {
  console.log(error);
}

export const MongoImage = getMongoModel<MongoImageSchemaType>('image', ImageSchema);
