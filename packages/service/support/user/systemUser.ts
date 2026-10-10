import { serviceEnv } from '../../env';
import { MongoTeamMember } from './team/teamMemberSchema';
import { MongoUser } from './schema';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { delay } from '@fastgpt/global/common/system/utils';
import { createDefaultTeam } from './team/controller';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { mongoSessionRun } from '../../common/mongo/sessionRun';
import { getLogger, LogCategories } from '../../common/logger';
import { LeaseCache, RedisLeaseUnavailableError } from '@fastgpt/dal/redis/caches';

const logger = getLogger(LogCategories.SYSTEM);
const systemUserLease = new LeaseCache({ logger: getLogger(LogCategories.INFRA.REDIS) });

const SYSTEM_USER_INIT_LEASE_KEY = 'system-user-init';
const LEASE_TTL_MS = 60 * 1000;
const LEASE_RENEW_INTERVAL_MS = 10 * 1000;
const WAIT_POLL_INTERVAL_MS = 1000;

/**
 * 解析环境变量中配置的内置 Agent 用户名列表。
 * 空白项会被自动剔除并去除前后空格。
 */
const getConfiguredAgentUsernames = (): string[] =>
  (serviceEnv.AGENT_USERS ?? '')
    .split(',')
    .map((username) => username.trim())
    .filter(Boolean);

/**
 * 获取固化的内置 Agent 用户 teamMember ID 只读集合。
 *
 * 为防止初始化未完成时发生权限穿透，若缓存尚未就绪将直接抛出异常（Fail-Closed 原则）。
 */
export const getAgentUserTmbIds = (): ReadonlySet<string> => {
  if (!global.agentUserTmbIds) {
    throw new Error('Agent user memberships have not been initialized');
  }
  return global.agentUserTmbIds;
};

/**
 * 判断指定团队成员 ID 是否属于内置 Agent 开发者账号。
 *
 * 供下游应用/资源鉴权链路调用：当应用创建者属于内置 Agent 用户时，
 * root 用户与团队 owner 不再默认拥有该应用的 owner 特权，必须走常规 ACL 鉴权。
 *
 * @param tmbId 待检查的团队成员 ID（支持 ObjectId、字符串或空值）
 * @returns 当且仅当 tmbId 存在且命中已固化的 Agent 用户 ID 集合时返回 true
 */
export const checkIsAgentUser = (tmbId: string | unknown): boolean => {
  if (!tmbId) return false;
  return getAgentUserTmbIds().has(String(tmbId));
};

/**
 * 实际执行用户创建的内部逻辑（在获取到 lease 后由胜出者执行）。
 */
const executeSystemUserCreation = async (defaultRootPassword: string): Promise<void> => {
  const agentUsernames = getConfiguredAgentUsernames();
  const defaultAgentPassword = serviceEnv.DEFAULT_AGENT_PSW;
  if (agentUsernames.length > 0 && !defaultAgentPassword) {
    throw new Error('DEFAULT_AGENT_PSW is required when AGENT_USERS is configured');
  }

  const { agentUserTmbIds } = await mongoSessionRun(async (session) => {
    // 1. 初始化 root 用户与默认团队
    const rootUser = await MongoUser.findOne({ username: 'root' }, undefined, { session });
    const rootUId = await (async () => {
      if (rootUser) {
        await rootUser.updateOne(
          {
            password: hashStr(defaultRootPassword)
          },
          { session }
        );
        return rootUser._id;
      } else {
        const [{ _id }] = await MongoUser.create(
          [
            {
              username: 'root',
              password: hashStr(defaultRootPassword)
            }
          ],
          { session, ordered: true }
        );
        return _id;
      }
    })();

    const defaultTeam = await createDefaultTeam({ userId: rootUId, session });
    if (!defaultTeam?.teamId) {
      throw new Error('Default team creation failed or root team not found');
    }
    const rootTeamId = String(defaultTeam.teamId);

    // 2. 若未配置 Agent 用户，直接返回空集合
    if (agentUsernames.length === 0) {
      return {
        agentUserTmbIds: new Set<string>()
      };
    }

    // 3. 批量检查并创建 Agent 用户
    const existingUsers = await MongoUser.find({ username: { $in: agentUsernames } }, 'username', {
      session
    }).lean();
    const existingUsernameSet = new Set(existingUsers.map((u) => u.username));
    const missingUsernames = agentUsernames.filter((name) => !existingUsernameSet.has(name));

    if (missingUsernames.length > 0) {
      const hashedPassword = hashStr(defaultAgentPassword!);
      const createdUsers = await MongoUser.create(
        missingUsernames.map((username) => ({
          username,
          password: hashedPassword
        })),
        { session, ordered: true }
      );

      const now = new Date();
      await MongoTeamMember.create(
        createdUsers.map((user) => ({
          teamId: rootTeamId,
          userId: user._id,
          name: user.username,
          isSetMemberName: true,
          status: TeamMemberStatusEnum.active,
          createTime: now
        })),
        { session }
      );

      logger.info('Agent users created', {
        createdCount: missingUsernames.length,
        missingUsernames
      });
    }

    // 4. 查询 root 团队下全部 agent 用户并返回
    const allAgentUsers = await MongoUser.find({ username: { $in: agentUsernames } }, '_id', {
      session
    }).lean();
    const allAgentUserIds = allAgentUsers.map((user) => user._id);
    const teamMembers = await MongoTeamMember.find(
      { teamId: rootTeamId, userId: { $in: allAgentUserIds } },
      '_id',
      { session }
    ).lean();

    return {
      agentUserTmbIds: new Set(teamMembers.map((member) => String(member._id)))
    };
  });

  global.agentUserTmbIds = agentUserTmbIds;

  logger.info('Root and agent users initialized', {
    username: 'root',
    fromEnvPassword: defaultRootPassword !== '123456',
    agentUserCount: agentUsernames.length
  });
};

/**
 * 初始化系统用户（包含 root 超级管理员与内置 agent 开发用户）。
 *
 * 跨节点串行保证：
 * 1. 多个节点并发启动时竞争 Redis 分布式租约（LeaseCache）；
 * 2. 租约持有者在执行初始化期间每 10 秒自动续期，TTL 为 60 秒；
 * 3. 未获得租约的节点（抛出 RedisLeaseUnavailableError）进入轮询等待；
 * 4. 租约释放后，等待节点直接从数据库同步最新数据至全局缓存，保证全节点状态一致。
 *
 * @param defaultRootPassword 初始 root 用户密码（默认 123456，可通过环境变量覆盖）
 */
export const initSystemUser = async ({
  defaultRootPassword = '123456'
}: {
  defaultRootPassword?: string;
} = {}): Promise<void> => {
  while (true) {
    try {
      await systemUserLease.withLease({
        key: SYSTEM_USER_INIT_LEASE_KEY,
        label: 'system user initialization',
        ttlMs: LEASE_TTL_MS,
        renewIntervalMs: LEASE_RENEW_INTERVAL_MS,
        fn: async () => {
          await executeSystemUserCreation(defaultRootPassword);
        }
      });
      return;
    } catch (error) {
      // 被其他节点抢占了 lease，需要等待。
      if (error instanceof RedisLeaseUnavailableError) {
        logger.info('Waiting for system user initialization lease held by another node...');
        await delay(WAIT_POLL_INTERVAL_MS);
        continue;
      }

      logger.error('Root or agent users initialization failed', { error });
      throw new Error('Root or agent users initialization failed', { cause: error });
    }
  }
};
