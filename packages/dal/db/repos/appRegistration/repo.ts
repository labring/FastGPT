import { defineRepoToken } from '../../container';
import type { AppRegistrationRepository } from './repo.type';
import { MongoAppRegistrationRepository } from './mongo/repo';
import { SqlAppRegistrationRepository } from './sql/repo';

/** AppRegistration 仓储 DI Token（按运行时自动路由至 Mongo 或通用 SQL 实现，构造期透传 DbRuntime）。 */
export const AppRegistrationRepoToken = defineRepoToken<AppRegistrationRepository>(
  'AppRegistrationRepository',
  {
    mongo: (runtime) => new MongoAppRegistrationRepository(runtime),
    sql: () => new SqlAppRegistrationRepository()
  }
);
