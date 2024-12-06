import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, getMongoModel } from '../../../common/mongo';
import { MemberGroupSchemaType } from '@fastgpt/global/support/permission/memberGroup/type';
const { Schema } = connectionMongo;

export const MemberGroupCollectionName = 'team_member_groups';

export const MemberGroupSchema = new Schema(
  {
    teamId: {
      type: Schema.Types.ObjectId,
      ref: TeamCollectionName,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    avatar: {
      type: String
    },
    updateTime: {
      type: Date,
      default: () => new Date()
    }
  },
  {
    // Auto update updateTime
    timestamps: {
      updatedAt: 'updateTime'
    }
  }
);

try {
  MemberGroupSchema.index(
    {
      teamId: 1,
      name: 1
    },
    {
      unique: true
    }
  );
} catch (error) {
  console.log(error);
}

export const MongoMemberGroupModel = getMongoModel<MemberGroupSchemaType>(
  MemberGroupCollectionName,
  MemberGroupSchema
);
