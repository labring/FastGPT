import { Schema, getMongoModel } from '../../common/mongo/index';
import { AppCollectionName } from '../../core/app/schema';
import { TeamMemberCollectionName } from '@fastgpt/global/support/user/team/constant';
import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';

export const AppRegistrationCollectionName = 'app_registrations';

const AppRegistrationSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName,
    required: true
  },
  appId: {
    type: Schema.Types.ObjectId,
    ref: AppCollectionName
  },
  createdAt: {
    type: Date
  }
});

AppRegistrationSchema.index({ teamId: 1 });

export const MongoAppRegistration = getMongoModel(
  AppRegistrationCollectionName,
  AppRegistrationSchema
);
