import { TeamCollectionName } from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, getMongoModel } from '../../../common/mongo';
import { type MemberGroupSchemaType } from '@fastgpt/global/support/permission/memberGroup/type';
import { getLogger, LogCategories } from '../../../common/logger';
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

const logger = getLogger(LogCategories.INFRA.MONGO);

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
  logger.error('Failed to build member group indexes', { error });
}

export const MongoMemberGroupModel = getMongoModel<MemberGroupSchemaType>(
  MemberGroupCollectionName,
  MemberGroupSchema
);
