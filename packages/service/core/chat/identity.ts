import type { ChatAuthProxy } from '@fastgpt/global/support/permission/chat';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { notLeaveStatus } from '@fastgpt/global/support/user/team/constant';
import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';
import { MongoUser } from '../../support/user/schema';
import { MongoTeamMember } from '../../support/user/team/teamMemberSchema';

/**
 * 解析所有 Chat 请求的有效成员；普通身份保留凭证成员，代理身份返回同团队在职成员及用户 ID。
 *
 * 普通调用直接使用鉴权凭证中的 tmbId。只有开启 authProxy 的个人密钥调用，
 * 才允许通过 authProxy 指定“代表团队内某个成员执行”。代理成员必须仍在当前团队内；
 * username 与 tmbId 同时传入时只使用 tmbId；ID 无效或成员不可用时不回退到用户名。
 */
export const resolveChatProxyMember = async ({
  authType,
  authProxy,
  teamId,
  tmbId,
  legacyAppId,
  apiKeyAuthProxy,
  apiKeyType
}: {
  authType?: `${AuthUserTypeEnum}`;
  authProxy?: ChatAuthProxy;
  teamId: string;
  tmbId: string;
  legacyAppId?: string;
  apiKeyAuthProxy?: boolean;
  apiKeyType?: ApiKeyTypeEnum;
}) => {
  if (!authProxy) {
    return {
      tmbId,
      isProxy: false
    };
  }

  if (
    authType !== AuthUserTypeEnum.apikey ||
    apiKeyType === ApiKeyTypeEnum.app ||
    legacyAppId ||
    !apiKeyAuthProxy
  ) {
    return Promise.reject(ChatErrEnum.unAuthChat);
  }

  const member = await (async () => {
    // 固定选择一种代理身份，避免低优先级的用户名影响已指定的 ID。
    if (authProxy.tmbId) {
      return MongoTeamMember.findOne({
        _id: authProxy.tmbId,
        teamId,
        status: notLeaveStatus
      })
        .select('_id userId teamId')
        .lean();
    }

    const username = 'username' in authProxy ? authProxy.username.trim() : undefined;
    if (!username) return null;

    const user = await MongoUser.findOne({ username }).select('_id').lean();
    if (!user) return null;

    return MongoTeamMember.findOne({
      teamId,
      userId: user._id,
      status: notLeaveStatus
    })
      .select('_id userId teamId')
      .lean();
  })();
  if (!member) {
    return Promise.reject(ChatErrEnum.unAuthChat);
  }

  return {
    tmbId: String(member._id),
    userId: String(member.userId),
    isProxy: true
  };
};
