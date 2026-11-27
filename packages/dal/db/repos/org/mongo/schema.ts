import { Schema } from 'mongoose';
import { defineMongoCollection } from '../../../mongo/collection';

export const OrgCollectionName = 'team_orgs';

export type OrgLookupMongoDoc = {
  _id: unknown;
  teamId: unknown;
};

const OrgLookupMongoSchema = new Schema(
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
 * Org 主体查询窄视图 Mongo 集合声明（渐进迁移期使用独立 modelName，避免与旧 MongoOrgModel 抢占模型缓存）。
 */
export const orgLookupMongoCollection = defineMongoCollection<OrgLookupMongoDoc>({
  name: OrgCollectionName,
  modelName: 'dal_org_lookup',
  datasource: 'main',
  schema: OrgLookupMongoSchema
});
