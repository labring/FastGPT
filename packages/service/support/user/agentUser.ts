import { MongoUser } from './schema';
import { MongoTeamMember } from './team/teamMemberSchema';

let cachedAgentUserTmbIds: Set<string> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

/**
 * 获取内置 agent user 的 tmbId 集合（带内存缓存）
 * agent user 列表由 AGENT_USERS 环境变量配置，默认为 agent_user_1/2/3
 */
export async function getAgentUserTmbIds(): Promise<Set<string>> {
  const now = Date.now();
  if (cachedAgentUserTmbIds && now - cacheTimestamp < CACHE_TTL) {
    return cachedAgentUserTmbIds;
  }

  const usernames = process.env.AGENT_USERS
    ? process.env.AGENT_USERS.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : ['agent_user_1', 'agent_user_2', 'agent_user_3'];

  const users = await MongoUser.find({ username: { $in: usernames } }, '_id').lean();
  const userIds = users.map((u) => u._id);

  if (userIds.length === 0) {
    cachedAgentUserTmbIds = new Set<string>();
    cacheTimestamp = now;
    return cachedAgentUserTmbIds;
  }

  const teamMembers = await MongoTeamMember.find({ userId: { $in: userIds } }, '_id').lean();

  cachedAgentUserTmbIds = new Set(teamMembers.map((tm) => String(tm._id)));
  cacheTimestamp = now;
  return cachedAgentUserTmbIds;
}
