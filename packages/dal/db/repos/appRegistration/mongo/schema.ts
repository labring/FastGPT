import { Schema } from 'mongoose';
import { defineMongoCollection } from '../../../mongo/collection';

export const AppRegistrationCollectionName = 'app_registrations';

export type AppRegistrationMongoDoc = {
  teamId: unknown;
  tmbId: unknown;
  appId?: unknown;
  createdAt?: Date | null;
};

const AppRegistrationMongoSchema = new Schema(
  {
    teamId: {
      type: Schema.Types.ObjectId,
      ref: 'teams',
      required: true
    },
    tmbId: {
      type: Schema.Types.ObjectId,
      ref: 'team_members',
      required: true
    },
    appId: {
      type: Schema.Types.ObjectId,
      ref: 'apps'
    },
    createdAt: {
      type: Date
    }
  },
  { versionKey: false }
);

/** AppRegistration MongoDB 纯声明式集合定义（零导入副作用，由 MongoRepositoryBase 构造期自动绑定 Model）。 */
export const appRegistrationMongoCollection = defineMongoCollection<AppRegistrationMongoDoc>({
  name: AppRegistrationCollectionName,
  datasource: 'main',
  schema: AppRegistrationMongoSchema,
  indexes: [
    // 保留存量现行索引键名（teamId_1），零重建兼容既有 Mongo 集群
    { key: { teamId: 1 } }
  ]
});
