import crypto from 'crypto';
import { memoize } from 'lodash-es';
import { serviceEnv } from '../../env';

/**
 * 获取基于 AES256_SECRET_KEY 或指定 secret 派生的 32 字节密钥。
 *
 * `scryptSync` 是高 CPU/内存开销的密码派生算法。采用 `memoize` 缓存计算结果，
 * 避免在每次加解密时重复执行耗时的同步 KDF 计算，同时在环境变量动态变更或单测场景下自动根据新 secret 计算与缓存。
 */
export const getDerivedKey = memoize(
  (secret: string = serviceEnv.AES256_SECRET_KEY): Buffer => {
    return crypto.scryptSync(secret, 'salt', 32);
  },
  (secret = serviceEnv.AES256_SECRET_KEY) => secret
);

/**
 * 使用 AES-256-GCM 加密明文字符串。
 *
 * 输出格式为 `iv:encrypted:authTag` 的十六进制字符串。
 */
export const encryptSecret = (text: string) => {
  const iv = crypto.randomBytes(16);
  const key = getDerivedKey();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
};

/**
 * 解密由 `encryptSecret` 加密的密文字符串。
 *
 * 若输入为空或格式不合法，返回空字符串；若密文被篡改，抛出认证失败异常。
 */
export const decryptSecret = (encryptedText?: string) => {
  if (!encryptedText) {
    return '';
  }

  const [ivHex, encryptedHex, authTagHex] = encryptedText.split(':');

  if (!ivHex || !encryptedHex || !authTagHex) {
    return '';
  }

  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = getDerivedKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
};
