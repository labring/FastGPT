import crypto from 'crypto';
import { AES256_SECRET_KEY } from './constants';

export const encryptSecret = (text: string) => {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(AES256_SECRET_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
};

export const decryptSecret = (encryptedText: string) => {
  const [ivHex, encryptedHex, authTagHex] = encryptedText.split(':');

  if (!ivHex || !encryptedHex || !authTagHex) {
    return '';
  }

  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = crypto.scryptSync(AES256_SECRET_KEY, 'salt', 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
};
