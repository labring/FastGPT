import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, getMongoModel } from '../../../../common/mongo';
import { InvitationSchemaType } from './type';
import addDays from 'date-fns/esm/fp/addDays/index.js';
const { Schema } = connectionMongo;

export const InvitationCollectionName = 'team_invitation_links';

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
  },
  members: {
    type: [String],
    default: []
  }
});

InvitationSchema.virtual('team', {
  ref: TeamCollectionName,
  localField: 'teamId',
  foreignField: '_id',
  justOne: true
});

InvitationSchema.index({ expires: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

try {
  InvitationSchema.index({ teamId: 1 }, { background: true });
} catch (error) {
  console.log(error);
}

export const MongoInvitationLink = getMongoModel<InvitationSchemaType>(
  InvitationCollectionName,
  InvitationSchema
);
