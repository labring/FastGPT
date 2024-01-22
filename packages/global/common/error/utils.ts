import { replaceSensitiveLink } from '../string/tools';

export const getErrText = (err: any, def = '') => {
  const msg: string = typeof err === 'string' ? err : err?.message || def || '';
  msg && console.log('error =>', msg);
  return replaceSensitiveLink(msg);
};
