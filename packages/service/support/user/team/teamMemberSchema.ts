import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { TeamMemberSchema as TeamMemberType } from '@fastgpt/global/support/user/team/type.d';
import { userCollectionName } from '../../user/schema';
import {
  TeamMemberStatusMap,
  TeamMemberCollectionName,
  TeamCollectionName
} from '@fastgpt/global/support/user/team/constant';

const defaultAvatars = [
  '/imgs/avatar/RoyalBlueAvatar.svg',
  '/imgs/avatar/PurpleAvatar.svg',
  '/imgs/avatar/AdoraAvatar.svg',
  '/imgs/avatar/OrangeAvatar.svg',
  '/imgs/avatar/RedAvatar.svg',
  '/imgs/avatar/GrayModernAvatar.svg',
  '/imgs/avatar/TealAvatar.svg',
  '/imgs/avatar/GreenAvatar.svg',
  '/imgs/avatar/BrightBlueAvatar.svg',
  '/imgs/avatar/BlueAvatar.svg'
];

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
  avatar: {
    type: String,
    default: defaultAvatars[Math.floor(Math.random() * defaultAvatars.length)]
  },

  // Abandoned
  role: {
    type: String
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
