import { getMongoModel, Schema } from '../../common/mongo';
import type { SecretType } from '@fastgpt/global/common/secret/type';
import { SecretTypeEnum } from '@fastgpt/global/common/secret/constants';

export const secretCollectionName = 'secrets';

export const secretSchema = new Schema({
  sourceId: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: Object.values(SecretTypeEnum),
    required: true
  },
  value: {
    type: String,
    required: true
  }
});

secretSchema.index({ sourceId: 1, type: 1 });

export const MongoSecret = getMongoModel<SecretType>(secretCollectionName, secretSchema);
