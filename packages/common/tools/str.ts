import crypto from 'crypto';

export function strIsLink(str?: string) {
  if (!str) return false;
  if (/^((http|https)?:\/\/|www\.|\/)[^\s/$.?#].[^\s]*$/i.test(str)) return true;
  return false;
}

export const hashStr = (psw: string) => {
  return crypto.createHash('sha256').update(psw).digest('hex');
};
