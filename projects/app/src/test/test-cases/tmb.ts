// const TeamMemberSchema = new Schema({
//   teamId: {
//     type: Schema.Types.ObjectId,
//     ref: TeamCollectionName,
//     required: true
//   },
//   userId: {
//     type: Schema.Types.ObjectId,
//     ref: userCollectionName,
//     required: true
//   },
//   name: {
//     type: String,
//     default: 'Member'
//   },
//   role: {
//     type: String
//     // enum: Object.keys(TeamMemberRoleMap) // disable enum validation for old data
//   },
//   status: {
//     type: String,
//     enum: Object.keys(TeamMemberStatusMap)
//   },
//   createTime: {
//     type: Date,
//     default: () => new Date()
//   },
//   defaultTeam: {
//     type: Boolean,
//     default: false
//   }
// });

import { team_root } from './team';
import { root, testUser1 } from './user';

export const tmb_root_root = {
  _id: 'tmb_root_root',
  teamId: team_root._id,
  userId: root._id,
  name: 'Owner',
  role: 'owner',
  status: 'active'
};

export const tmb_user1_root = {
  _id: 'tmb_user1_root',
  teamId: team_root._id,
  userId: testUser1._id,
  name: 'User1',
  role: 'member',
  status: 'active'
};
