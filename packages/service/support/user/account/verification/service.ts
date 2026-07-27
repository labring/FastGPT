import type { CodeAccountVerificationScene } from '@fastgpt/global/support/user/account/verification/type';
import { UserError } from '@fastgpt/global/common/error/utils';

/** 统一账号验证方式的材料创建与消费模型。 */
export abstract class AccountVerification<
  TCreateParams,
  TCreateResult,
  TConsumeParams,
  TConsumeResult
> {
  abstract create(params: TCreateParams): Promise<TCreateResult>;
  abstract consume(params: TConsumeParams): Promise<TConsumeResult>;
}

export type LocalAccountIdentity = {
  kind: 'local';
  userId: string;
  username: string;
  lastLoginTmbId?: string;
  isRoot: boolean;
};

export type VerifiedContactIdentity = {
  kind: 'contact';
  account: string;
  scene: CodeAccountVerificationScene;
};

export type ExternalAccountIdentity = {
  kind: 'external';
  provider: 'github' | 'google' | 'microsoft' | 'wecom' | 'sso' | 'wechat';
  subject: string;
  username: string;
  avatar?: string;
  notificationAccount?: string;
  phonePrefix?: number;
  teamName?: string;
  memberName?: string;
  organizationId?: string;
};

/**
 * 敏感业务必须用持久化 username 精确校验外部身份归属。
 * 该校验同样适用于旧 SSO 的无 state code-only 兼容路径。
 */
export const assertExternalAccountIdentityMatchesUsername = ({
  identity,
  username
}: {
  identity: ExternalAccountIdentity;
  username: string;
}) => {
  if (identity.username !== username) {
    throw new UserError('Verified external identity does not match the current user');
  }
};
