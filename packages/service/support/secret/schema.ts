import { getMongoModel, Schema } from '../../common/mongo';
import type { SecretType } from '@fastgpt/global/common/secret/type';
import { SecretTypeEnum } from '@fastgpt/global/common/secret/constants';
import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';

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
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  value: {
    type: String,
    required: true
  }
});

secretSchema.index({ type: 1, sourceId: 1 });

export const MongoSecret = getMongoModel<SecretType>(secretCollectionName, secretSchema);
