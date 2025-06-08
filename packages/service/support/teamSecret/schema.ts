import type { TeamSecretType } from '@fastgpt/global/common/teamSecret/type';
import { getMongoModel, Schema } from '../../common/mongo';
import { TeamSecretTypeEnum } from '@fastgpt/global/common/teamSecret/constants';

export const teamSecretCollectionName = 'team_secrets';

export const teamSecretSchema = new Schema({
  sourceId: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: Object.values(TeamSecretTypeEnum),
    required: true
  },
  value: {
    type: String,
    required: true
  }
});

teamSecretSchema.index({ sourceId: 1, type: 1 });

export const MongoTeamSecret = getMongoModel<TeamSecretType>(
  teamSecretCollectionName,
  teamSecretSchema
);
