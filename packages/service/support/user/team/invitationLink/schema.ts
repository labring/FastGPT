import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, getMongoModel } from '../../../../common/mongo';
import { InvitationSchemaType } from './type';
const { Schema } = connectionMongo;

export const InvitationCollectionName = 'TeamInvitation';

const InvitationSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  usedTimesLimit: {
    type: Number
  },
  forbidden: {
    type: Boolean
  },
  expires: {
    type: Date
  },
  description: {
    type: String
  }
});

InvitationSchema.virtual('members', {
  ref: TeamMemberCollectionName,
  localField: '_id',
  foreignField: 'invitationLinkId',
  justOne: false
});

try {
  InvitationSchema.index({ teamId: 1 }, { background: true });
} catch (error) {
  console.log(error);
}

export const MongoInvitaionLink = getMongoModel<InvitationSchemaType>(
  InvitationCollectionName,
  InvitationSchema
);
