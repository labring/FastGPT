import { createHash } from 'node:crypto';
import { CliArgumentError } from './errors';

export const PROFILE_NAME_REG = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

/**
 * 计算 UTF-8 原文的 64 位小写 SHA-256 摘要，用于对齐 FastGPT 密码登录协议。
 */
export function sha256Hex(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/**
 * 校验 Profile 名称合法性，确保可直接作为配置键和系统 Keychain account 标识。
 */
export function assertValidProfileName(profileName: string): string {
  const trimmed = profileName.trim();
  if (!PROFILE_NAME_REG.test(trimmed)) {
    throw new CliArgumentError(
      `Invalid profile name "${profileName}". Use 1-64 characters matching [a-zA-Z0-9._-], starting with alphanumeric.`
    );
  }
  return trimmed;
}
