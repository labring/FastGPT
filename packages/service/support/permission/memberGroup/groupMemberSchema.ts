import { TeamMemberCollectionName } from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, getMongoModel } from '../../../common/mongo';
import { MemberGroupSchema, MemberGroupCollectionName } from './memberGroupSchema';
const { Schema } = connectionMongo;

export const GroupMemberCollectionName = 'group_member';

export const GroupMemberSchema = new Schema({
  groupId: {
    type: Schema.Types.ObjectId,
    ref: MemberGroupCollectionName,
    required: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName,
    required: true
  }
});

try {
  GroupMemberSchema.index({
    groupId: 1
  });

  GroupMemberSchema.index({
    tmbId: 1
  });
} catch (error) {
  console.log(error);
}

export const MongoGroupMemberModel = getMongoModel<GroupMemberSchemaType>(
  GroupMemberCollectionName,
  MemberGroupSchema
);
