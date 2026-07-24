import { defineIndex, connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { type TeamMemberSchema as TeamMemberType } from '@fastgpt/global/support/user/team/type';
import { userCollectionName } from '../../user/schema';
import {
  TeamMemberStatusMap,
  TeamMemberCollectionName,
  TeamCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { getRandomUserAvatar } from '@fastgpt/global/support/user/utils';

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
  avatar: {
    type: String,
    default: () => getRandomUserAvatar()
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
  updateTime: {
    type: Date
  },

  /** @deprecated
   * But some code still use this to judge whether the member is a owner.
   * TODO: Remove this field and replace it with a more appropriate way to determine ownership.
   */
  role: {
    type: String
  },
  /** @deprecated */
  defaultTeam: {
    type: Boolean
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

defineIndex(TeamMemberSchema, {
  key: { teamId: 1 },
  options: { background: true }
});
defineIndex(TeamMemberSchema, {
  key: { userId: 1 },
  options: { background: true }
});

export const MongoTeamMember = getMongoModel<TeamMemberType>(
  TeamMemberCollectionName,
  TeamMemberSchema
);
