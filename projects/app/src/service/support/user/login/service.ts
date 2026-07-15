import { UserError } from '@fastgpt/global/common/error/utils';
import type { LangEnum } from '@fastgpt/global/common/i18n/type';
import type { FastGPTSemType } from '@fastgpt/global/support/marketing/type';
import {
  reportCRMVisitorIdentity,
  resolveCRMVisitorId
} from '@fastgpt/service/support/marketing/attribution';
import type { LocalAccountIdentity } from '@fastgpt/service/support/user/account/verification/service';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { createUserSession } from '@fastgpt/service/support/user/session';

/**
 * 把可信本地身份转换为登录态，并更新语言、最后访问团队及访客归因。
 * Cookie、埋点和审计保留在 API 成功分支，避免验证失败产生登录副作用。
 */
export const loginLocalAccount = async ({
  identity,
  language,
  fastgpt_sem,
  ip
}: {
  identity: LocalAccountIdentity;
  language?: `${LangEnum}`;
  fastgpt_sem?: FastGPTSemType;
  ip?: string | null;
}) => {
  if (identity.username.startsWith('wecom-')) {
    throw new UserError('Wecom user can not login with password');
  }

  const user = await getUserDetail({
    tmbId: identity.lastLoginTmbId,
    userId: identity.userId,
    isRoot: identity.isRoot
  });

  const account = await MongoUser.findById(identity.userId, 'fastgpt_sem').lean();
  const visitorIdentity = resolveCRMVisitorId({
    storedFastgptSem: account?.fastgpt_sem,
    incomingVisitorId: fastgpt_sem?.visitor_id
  });

  await MongoUser.updateOne(
    { _id: identity.userId },
    {
      lastLoginTmbId: user.team.tmbId,
      ...(language && { language }),
      ...(visitorIdentity.shouldPersist && { fastgpt_sem: visitorIdentity.fastgptSem })
    }
  );

  const token = await createUserSession({
    userId: identity.userId,
    teamId: user.team.teamId,
    tmbId: user.team.tmbId,
    isRoot: identity.isRoot,
    ip
  });

  void reportCRMVisitorIdentity({
    visitorId: visitorIdentity.visitorId,
    userId: identity.userId,
    username: user.username,
    contact: user.contact
  });

  return { user, token };
};
