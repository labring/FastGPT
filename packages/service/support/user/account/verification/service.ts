import type { CodeAccountVerificationScene } from '@fastgpt/global/support/user/account/verification/type';

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
