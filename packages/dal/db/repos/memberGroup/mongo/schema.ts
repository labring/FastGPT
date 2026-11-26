import { Schema } from 'mongoose';
import { defineMongoCollection } from '../../../mongo/collection';

export const MemberGroupCollectionName = 'team_member_groups';

export type MemberGroupLookupMongoDoc = {
  _id: unknown;
  teamId: unknown;
};

const MemberGroupLookupMongoSchema = new Schema(
  {
    teamId: {
      type: Schema.Types.ObjectId,
      required: true
    }
  },
  {
    versionKey: false,
    strict: false
  }
);

/**
 * MemberGroup 主体查询窄视图 Mongo 集合声明（渐进迁移期使用独立 modelName，避免与旧 MongoMemberGroupModel 抢占模型缓存）。
 */
export const memberGroupLookupMongoCollection = defineMongoCollection<MemberGroupLookupMongoDoc>({
  name: MemberGroupCollectionName,
  modelName: 'dal_member_group_lookup',
  datasource: 'main',
  schema: MemberGroupLookupMongoSchema
});
