import type { ResolvedCredential } from '../auth/auth-resolver';
import { CliArgumentError } from '../../shared/errors';

export type ChatTargetCredential = Pick<ResolvedCredential, 'kind' | 'boundAppId'>;

const UNSUPPORTED_CHAT_TARGET_KEYS = [
  'skillId',
  'sourceType',
  'sourceId',
  'shareId',
  'outLinkUid',
  'outLinkAuthData'
] as const;

/**
 * 校验对话与反馈操作仅作用于普通 App 会话，并统一执行 App 绑定与自定义用户凭证护栏。
 */
export function assertAppChatTarget({
  payload,
  credential,
  domainLabel
}: {
  readonly payload: Record<string, unknown>;
  readonly credential?: ChatTargetCredential;
  readonly domainLabel: 'Chat commands' | 'Chat feedback commands';
}): void {
  // 即使通过 JSON 文件或透传参数调用，也不能切换到 Skill/外链/其他会话来源。
  if (UNSUPPORTED_CHAT_TARGET_KEYS.some((key) => payload[key] !== undefined)) {
    throw new CliArgumentError(
      `${domainLabel} only accept App conversations. Use appId to select an App.`
    );
  }

  if (
    payload.appId === undefined &&
    credential?.kind !== 'appKey' &&
    credential?.kind !== 'unknownApiKey'
  ) {
    throw new CliArgumentError('--appId is required for a user session or personal API Key.');
  }

  if (
    (credential?.kind === 'appKey' || credential?.kind === 'unknownApiKey') &&
    credential.boundAppId &&
    payload.appId !== undefined &&
    payload.appId !== credential.boundAppId
  ) {
    throw new CliArgumentError('--appId does not match the App bound to the active API Key.');
  }

  if (payload.customUid !== undefined && payload.authProxy !== undefined) {
    throw new CliArgumentError('--customUid and --authProxy are mutually exclusive.');
  }

  if (
    payload.authProxy !== undefined &&
    (credential?.kind === 'appKey' || credential?.kind === 'token')
  ) {
    throw new CliArgumentError('--authProxy requires an enabled personal API Key.');
  }

  if (payload.customUid !== undefined && credential?.kind === 'token') {
    throw new CliArgumentError('--customUid requires an API Key.');
  }
}
