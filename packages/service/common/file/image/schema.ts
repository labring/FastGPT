import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { defineIndex, Schema, getMongoModel } from '../../mongo';
import { type MongoImageSchemaType } from '@fastgpt/global/common/file/image/type';
import { getLogger, LogCategories } from '../../logger';

const logger = getLogger(LogCategories.INFRA.MONGO);

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

// tts expired（60 Minutes）
defineIndex(ImageSchema, {
  key: { expiredTime: 1 },
  options: { expireAfterSeconds: 60 * 60 }
});
defineIndex(ImageSchema, { key: { type: 1 } });
// delete related img
defineIndex(ImageSchema, { key: { teamId: 1, 'metadata.relatedId': 1 } });

// Cron clear invalid img
defineIndex(ImageSchema, {
  key: { createTime: 1 },
  options: { partialFilterExpression: { 'metadata.relatedId': { $exists: true } } }
});

export const MongoImage = getMongoModel<MongoImageSchemaType>('image', ImageSchema);
