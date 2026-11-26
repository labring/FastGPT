import { Schema } from 'mongoose';
import { defineMongoCollection } from '../../../mongo/collection';

export const TeamMemberCollectionName = 'team_members';

export type TeamMemberLookupMongoDoc = {
  _id: unknown;
  teamId: unknown;
  userId: unknown;
  status?: string;
};

const TeamMemberLookupMongoSchema = new Schema(
  {
    teamId: {
      type: Schema.Types.ObjectId,
      required: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      required: true
    },
    status: {
      type: String
    }
  },
  {
    versionKey: false,
    strict: false
  }
);

/**
 * TeamMember 主体查询窄视图 Mongo 集合声明（渐进迁移期使用独立 modelName，避免与旧 MongoTeamMember 抢占模型缓存）。
 */
export const teamMemberLookupMongoCollection = defineMongoCollection<TeamMemberLookupMongoDoc>({
  name: TeamMemberCollectionName,
  modelName: 'dal_team_member_lookup',
  datasource: 'main',
  schema: TeamMemberLookupMongoSchema
});
