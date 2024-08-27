import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, getMongoModel } from '../../../common/mongo';
const { Schema } = connectionMongo;

export const MemberGroupCollectionName = 'member_group';

export const MemberGroupSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  name: {
    type: String
  },
  avatar: {
    type: String
  }
});

try {
  MemberGroupSchema.index({
    teamId: 1,
    tmbId: 1
  });
} catch (error) {
  console.log(error);
}

export const MongoMemberGroupModel = getMongoModel<MemberGroupSchemaType>(
  MemberGroupCollectionName,
  MemberGroupSchema
);
