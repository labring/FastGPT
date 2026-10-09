import { serviceEnv } from '../../env';
import { MongoTeamMember } from './team/teamMemberSchema';
import { MongoUser } from './schema';

const getConfiguredAgentUsernames = () =>
  (serviceEnv.AGENT_USERS ?? '')
    .split(',')
    .map((username) => username.trim())
    .filter(Boolean);

export async function initializeAgentUserTmbIds(): Promise<void> {
  const usernames = getConfiguredAgentUsernames();
  if (usernames.length === 0) {
    global.agentUserTmbIds = new Set();
    return;
  }

  const users = await MongoUser.find({ username: { $in: usernames } }, '_id').lean();
  const userIds = users.map((user) => user._id);
  const teamMembers = await MongoTeamMember.find({ userId: { $in: userIds } }, '_id').lean();
  global.agentUserTmbIds = new Set(teamMembers.map((member) => String(member._id)));
}

export function getAgentUserTmbIds(): ReadonlySet<string> {
  if (!global.agentUserTmbIds) {
    throw new Error('Agent user memberships have not been initialized');
  }
  return global.agentUserTmbIds;
}
