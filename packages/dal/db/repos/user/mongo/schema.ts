import { Schema } from 'mongoose';
import { defineMongoCollection } from '../../../mongo/collection';

export const UserCollectionName = 'users';

export type UserLookupMongoDoc = {
  _id: unknown;
  username?: string;
};

const UserLookupMongoSchema = new Schema(
  {
    username: {
      type: String
    }
  },
  {
    versionKey: false,
    strict: false
  }
);

/**
 * User 主体查询窄视图 Mongo 集合声明（渐进迁移期使用独立 modelName，避免与旧 MongoUser 抢占模型缓存）。
 */
export const userLookupMongoCollection = defineMongoCollection<UserLookupMongoDoc>({
  name: UserCollectionName,
  modelName: 'dal_user_lookup',
  datasource: 'main',
  schema: UserLookupMongoSchema
});
