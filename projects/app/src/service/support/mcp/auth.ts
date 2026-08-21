import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import {
  McpAuthProxySchema,
  type McpAuthProxyType
} from '@fastgpt/global/openapi/support/mcpServer/api';
import { McpAuthProxyHeader, type McpKeyType } from '@fastgpt/global/support/mcp/type';
import { notLeaveStatus } from '@fastgpt/global/support/user/team/constant';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';

type HeaderValue = string | string[] | undefined;

/** 从 MCP transport 请求头中解析可选的身份代理参数。 */
export const getMcpAuthProxyFromHeaders = (
  headers: Record<string, HeaderValue>
): McpAuthProxyType | undefined => {
  const getHeader = (name: string) => {
    const value = headers[name];
    return Array.isArray(value) ? value[0] : value;
  };

  const username = getHeader(McpAuthProxyHeader.username);
  const tmbId = getHeader(McpAuthProxyHeader.tmbId);
  if (!username && !tmbId) return undefined;

  return McpAuthProxySchema.parse({ username, tmbId });
};

/**
 * 解析 MCP 工具调用最终应归属的团队成员。
 *
 * 未提供代理身份时使用发布者；提供代理身份时要求发布项已开启 authProxy，且目标成员
 * 仍在发布项所属团队。username 与 tmbId 同时存在时必须指向同一成员。
 */
export const resolveMcpEffectiveTmbId = async ({
  mcp,
  authProxy
}: {
  mcp: Pick<McpKeyType, 'teamId' | 'tmbId' | 'authProxy'>;
  authProxy?: McpAuthProxyType;
}) => {
  if (!authProxy) {
    return String(mcp.tmbId);
  }

  if (!mcp.authProxy) {
    return Promise.reject(ERROR_ENUM.unAuthorization);
  }

  const username = authProxy.username?.trim();
  const [memberByTmbId, memberByUsername] = await Promise.all([
    authProxy.tmbId
      ? MongoTeamMember.findOne({
          _id: authProxy.tmbId,
          teamId: mcp.teamId,
          status: notLeaveStatus
        })
          .select('_id')
          .lean()
      : null,
    username
      ? (async () => {
          const user = await MongoUser.findOne({ username }).select('_id').lean();
          if (!user) return null;

          return MongoTeamMember.findOne({
            teamId: mcp.teamId,
            userId: user._id,
            status: notLeaveStatus
          })
            .select('_id')
            .lean();
        })()
      : null
  ]);

  if ((authProxy.tmbId && !memberByTmbId) || (username && !memberByUsername)) {
    return Promise.reject(ERROR_ENUM.unAuthorization);
  }

  if (
    memberByTmbId &&
    memberByUsername &&
    String(memberByTmbId._id) !== String(memberByUsername._id)
  ) {
    return Promise.reject(ERROR_ENUM.unAuthorization);
  }

  const member = memberByTmbId || memberByUsername;
  if (!member) {
    return Promise.reject(ERROR_ENUM.unAuthorization);
  }

  return String(member._id);
};
