import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { TeamMemberSchema as TeamMemberType } from '@fastgpt/global/support/user/team/type.d';
import { userCollectionName } from '../../user/schema';
import {
  TeamMemberStatusMap,
  TeamMemberCollectionName,
  TeamCollectionName
} from '@fastgpt/global/support/user/team/constant';

const TeamMemberSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: userCollectionName,
    required: true
  },
  name: {
    type: String,
    default: 'Member'
  },
  status: {
    type: String,
    enum: Object.keys(TeamMemberStatusMap)
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  defaultTeam: {
    type: Boolean,
    default: false
  },

  // Abandoned
  role: {
    type: String
    // enum: Object.keys(TeamMemberRoleMap) // disable enum validation for old data
  }
});

TeamMemberSchema.virtual('team', {
  ref: TeamCollectionName,
  localField: 'teamId',
  foreignField: '_id',
  justOne: true
});
TeamMemberSchema.virtual('user', {
  ref: userCollectionName,
  localField: 'userId',
  foreignField: '_id',
  justOne: true
});

try {
  TeamMemberSchema.index({ teamId: 1 }, { background: true });
  TeamMemberSchema.index({ userId: 1 }, { background: true });
} catch (error) {
  console.log(error);
}

export const MongoTeamMember = getMongoModel<TeamMemberType>(
  TeamMemberCollectionName,
  TeamMemberSchema
);
