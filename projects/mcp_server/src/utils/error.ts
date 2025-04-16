import { replaceSensitiveText } from './string.js';

export const getErrText = (err: any, def = ''): any => {
  const msg: string =
    typeof err === 'string'
      ? err
      : err?.response?.data?.message || err?.response?.message || err?.message || def;
  // msg && console.log('error =>', msg);
  return replaceSensitiveText(msg);
};
