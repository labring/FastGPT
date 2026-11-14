import { loginRiskCache } from '@fastgpt/dal/redis/caches/loginRisk';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { getLogger, LogCategories } from '../../../../../common/logger';

const logger = getLogger(LogCategories.INFRA.REDIS);

type LoginRiskContext = {
  username: string;
  ip: string;
  userAgent: string;
  automated?: boolean;
};

/** 风险拼图与登录二次验证、普通发送验证码使用不同作用域，凭证不能串用。 */
export const getPasswordLoginCaptchaScope = (username: string) => `password-login:${username}`;

/**
 * 基于服务端频次和失败窗口决定是否要求拼图；客户端自动化信号只能提高风险。
 * Redis 不可用时要求拼图，仍允许真人通过验证登录；二次验证豁免由调用层判定。
 */
export class LoginRiskService {
  constructor(
    private readonly cache: Pick<
      typeof loginRiskCache,
      'recordAttempt' | 'getFailures' | 'recordFailure'
    > = loginRiskCache
  ) {}

  async requiresCaptcha({ username, ip, userAgent, automated }: LoginRiskContext) {
    try {
      const scope = { account: hashStr(username), ip: hashStr(ip) };
      const [attempts, failures] = await Promise.all([
        this.cache.recordAttempt(scope),
        this.cache.getFailures(scope)
      ]);
      return (
        automated === true ||
        !userAgent ||
        /headless|selenium|phantomjs|python-requests|curl\//i.test(userAgent) ||
        attempts.account > 4 ||
        attempts.ip > 20 ||
        failures.account >= 3 ||
        failures.ip >= 10 ||
        !Number.isFinite(failures.account) ||
        !Number.isFinite(failures.ip)
      );
    } catch (error) {
      logger.warn('Login risk unavailable; requiring puzzle verification', { error });
      return true;
    }
  }

  /** 记录凭据错误；风控故障不能覆盖原始登录失败原因。 */
  async recordFailure({ username, ip }: Pick<LoginRiskContext, 'username' | 'ip'>) {
    try {
      await this.cache.recordFailure({ account: hashStr(username), ip: hashStr(ip) });
    } catch (error) {
      logger.warn('Failed to record login risk', { error });
    }
  }
}

export const loginRiskService = new LoginRiskService();
