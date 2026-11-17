import { defineRepoToken } from '@fastgpt/dal/db/container';
import type { AppRegistrationRepository } from './repo.type';
import { MongoAppRegistrationRepository } from './mongo/repo';
import { SqlAppRegistrationRepository } from './sql/repo';

/** AppRegistration 仓储 DI Token（按运行时自动路由至 Mongo 或通用 SQL 实现）。 */
export const AppRegistrationRepoToken = defineRepoToken<AppRegistrationRepository>(
  'AppRegistrationRepository',
  {
    mongo: () => new MongoAppRegistrationRepository(),
    sql: () => new SqlAppRegistrationRepository()
  }
);
