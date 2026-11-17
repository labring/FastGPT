import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { defineIndex, getMongoModel, Schema, type Model } from '../../../common/mongo/index';

export const AppRegistrationCollectionName = 'app_registrations';

type AppRegistrationMongoDoc = {
  teamId: unknown;
  tmbId: unknown;
  appId?: unknown;
  createdAt?: Date | null;
};

const AppRegistrationMongoSchema = new Schema(
  {
    teamId: {
      type: Schema.Types.ObjectId,
      ref: TeamCollectionName,
      required: true
    },
    tmbId: {
      type: Schema.Types.ObjectId,
      ref: TeamMemberCollectionName,
      required: true
    },
    appId: {
      type: Schema.Types.ObjectId,
      // 使用集合名常量字符串解耦对尚未迁移的 core/app/schema.ts 的跨模块直接依赖。
      ref: 'apps'
    },
    createdAt: {
      type: Date
    }
  },
  { versionKey: false }
);

defineIndex(AppRegistrationMongoSchema, { key: { teamId: 1 } });

let cachedModel: Model<AppRegistrationMongoDoc> | undefined;

/** 惰性获取 AppRegistration Mongoose Model，确保导入模块或运行 SQL 方言时零顶层注册副作用。 */
export const getAppRegistrationMongoModel = (): Model<AppRegistrationMongoDoc> => {
  if (cachedModel !== undefined) {
    return cachedModel;
  }
  cachedModel = getMongoModel<AppRegistrationMongoDoc>(
    AppRegistrationCollectionName,
    AppRegistrationMongoSchema
  );
  return cachedModel;
};
