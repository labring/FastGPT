import crypto from 'crypto';
import { HeaderAuthTypeEnum } from './constants';
import { type StoreSecretValueType } from './type';

export const encryptSecret = (text: string, secretKey?: string) => {
  if (!secretKey) return text;
  try {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(secretKey, 'salt', 32);
    // @ts-ignore
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    // @ts-ignore
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
  } catch (error) {
    console.error('Encryption error:', error);
    return '';
  }
};

export const decryptSecret = (encryptedText: string, secretKey: string) => {
  try {
    const [ivHex, encryptedHex, authTagHex] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const key = crypto.scryptSync(secretKey, 'salt', 32);
    // @ts-ignore
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    // @ts-ignore
    decipher.setAuthTag(authTag);
    // @ts-ignore
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Decryption error:', error);
    return '';
  }
};

export const getSecretValue = async ({
  storeSecret,
  secretKey
}: {
  storeSecret: StoreSecretValueType;
  secretKey?: string;
}): Promise<{ key: string; value: string }[]> => {
  if (!storeSecret || Object.keys(storeSecret).length === 0 || !secretKey) return [];

  try {
    return Object.entries(storeSecret).reduce(
      (acc: { key: string; value: string }[], [key, { secret, value }]) => {
        let actualValue = value || '';
        if (secret && secretKey) {
          actualValue = decryptSecret(secret, secretKey);
        }

        const isAuthHeader = [HeaderAuthTypeEnum.Bearer, HeaderAuthTypeEnum.Basic].includes(
          key as HeaderAuthTypeEnum
        );
        const formatKey = isAuthHeader ? 'Authorization' : key;
        const formatValue = (() => {
          if (key === HeaderAuthTypeEnum.Bearer) {
            return `Bearer ${actualValue}`;
          }
          if (key === HeaderAuthTypeEnum.Basic) {
            return `Basic ${actualValue}`;
          }
          return actualValue;
        })();

        acc.push({ key: formatKey, value: formatValue });
        return acc;
      },
      []
    );
  } catch (error) {
    return Promise.reject(error);
  }
};
