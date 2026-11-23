import { defineRepoToken } from '../../container';
import type { AppRegistrationRepository } from './repo.type';
import { MongoAppRegistrationRepository } from './mongo/repo';
import { OceanBaseAppRegistrationRepository } from './oceanbase/repo';

/** AppRegistration 仓储 DI Token（按运行时方言路由至 MongoDB 或 OceanBase 实现）。 */
export const AppRegistrationRepoToken = defineRepoToken<AppRegistrationRepository>(
  'AppRegistrationRepository',
  {
    mongo: (runtime) => new MongoAppRegistrationRepository(runtime),
    oceanbase: (runtime) => new OceanBaseAppRegistrationRepository(runtime)
  }
);
