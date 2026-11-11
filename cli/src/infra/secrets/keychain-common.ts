import { assertValidProfileName } from '../../shared/crypto';

export const KEYCHAIN_SERVICE = 'fastgpt-cli';

/**
 * 统一生成各平台系统 Keychain 条目的 account 标识，保证跨平台规则一致。
 */
export function getKeychainAccountKey(profileName: string): string {
  return `profile:${assertValidProfileName(profileName)}`;
}
