import { replaceSensitiveText } from '../string/tools';
import { ERROR_RESPONSE } from './errorCode';

export const getErrText = (err: any, def = ''): any => {
  const msg: string =
    typeof err === 'string'
      ? err
      : err?.response?.data?.message ||
        err?.response?.message ||
        err?.message ||
        err?.response?.data?.msg ||
        err?.response?.msg ||
        err?.msg ||
        err?.error ||
        def;

  if (ERROR_RESPONSE[msg]) {
    return ERROR_RESPONSE[msg].message;
  }

  // msg && console.log('error =>', msg);
  return replaceSensitiveText(msg);
};
