import { injectRepo } from '@fastgpt/dal/db/container';
import { AppRegistrationRepoToken } from '@fastgpt/dal/db/repos/appRegistration/repo';
import type {
  AppRegistrationDomainDTO,
  AppRegistrationRepository
} from '@fastgpt/dal/db/repos/appRegistration/repo.type';
import { runInTransaction } from '@fastgpt/dal/db/transaction';
import type { DbSession } from '@fastgpt/dal/db/types';

export type AppRegistrationServiceDeps = {
  appRegistrationRepo?: AppRegistrationRepository;
  runTx?: <T>(fn: (tx: DbSession) => Promise<T>) => Promise<T>;
};

export type RegisterAppParams = {
  teamId: string;
  tmbId: string;
  appId: string;
  quotaLimit?: number;
  tx?: DbSession;
};

/** AppRegistration 领域编排服务，通过构造函数依赖注入实现零 Mock 单测隔离。 */
export class AppRegistrationService {
  private readonly appRegistrationRepo: AppRegistrationRepository;
  private readonly runTx: <T>(fn: (tx: DbSession) => Promise<T>) => Promise<T>;

  constructor(deps: AppRegistrationServiceDeps = {}) {
    this.appRegistrationRepo = deps.appRegistrationRepo ?? injectRepo(AppRegistrationRepoToken);
    this.runTx = deps.runTx ?? ((fn) => runInTransaction(fn));
  }

  /** 统计指定团队当前已备案的应用数量。 */
  async countTeamRegistrations({
    teamId,
    tx
  }: {
    teamId: string;
    tx?: DbSession;
  }): Promise<number> {
    return this.appRegistrationRepo.countByTeam({ teamId, tx });
  }

  /** 在事务内校验重复备案与团队配额上限后创建应用备案记录。 */
  async registerApp({
    teamId,
    tmbId,
    appId,
    quotaLimit,
    tx
  }: RegisterAppParams): Promise<AppRegistrationDomainDTO> {
    const execute = async (activeTx: DbSession) => {
      // 1. 防止同一应用被重复备案
      const existing = await this.appRegistrationRepo.findByTeamAndApp({
        teamId,
        appId,
        tx: activeTx
      });
      if (existing !== null) {
        return Promise.reject('Registration already exists for this app');
      }

      // 2. 若套餐设置了正数备案配额，则在同事务内校验已用量
      if (quotaLimit !== undefined && quotaLimit > 0) {
        const currentCount = await this.appRegistrationRepo.countByTeam({
          teamId,
          tx: activeTx
        });
        if (currentCount >= quotaLimit) {
          return Promise.reject(
            `Registration quota exceeded. Current: ${currentCount}, Limit: ${quotaLimit}`
          );
        }
      }

      // 3. 写入备案记录并返回归一化后的领域 DTO
      return this.appRegistrationRepo.create({
        data: {
          teamId,
          tmbId,
          appId,
          createdAt: new Date()
        },
        tx: activeTx
      });
    };

    if (tx !== undefined) {
      return execute(tx);
    }
    return this.runTx(execute);
  }

  /** 按团队与应用删除全部关联的备案记录。 */
  async deleteAppRegistrations({
    teamId,
    appId,
    tx
  }: {
    teamId: string;
    appId: string;
    tx?: DbSession;
  }): Promise<number> {
    return this.appRegistrationRepo.deleteByApp({ teamId, appId, tx });
  }
}

export const appRegistrationService = new AppRegistrationService();
