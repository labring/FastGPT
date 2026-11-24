import type { MongoCollectionDefinition } from '../mongo/collection';
import { appRegistrationMongoCollection } from './appRegistration/mongo/schema';
import { APP_REGISTRATION_OCEANBASE_DDL } from './appRegistration/oceanbase/table';

/** 开源主仓已迁入 `@fastgpt/dal` 的全部 MongoDB 集合声明注册表（供后台异步只增索引同步使用）。 */
export const coreMongoCollections: readonly MongoCollectionDefinition<any>[] = [
  appRegistrationMongoCollection
];

/** 开源主仓已迁入 `@fastgpt/dal` 的 OceanBase 原生建表 DDL 列表（供测试环境初始化使用）。 */
export const coreOceanBaseDdls: readonly string[] = [APP_REGISTRATION_OCEANBASE_DDL];
