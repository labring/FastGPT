import { replaceSensitiveText } from '../string/tools';
import { ERROR_RESPONSE } from './errorCode';

export const getErrText = (err: any, def = ''): any => {
  const getRawMsg = (e: any): any => {
    if (typeof e === 'string') return e;
    if (!e) return '';
    return (
      e.system_error_text ||
      e.errorText ||
      e.response?.data?.message ||
      e.response?.message ||
      e.response?.data?.msg ||
      e.response?.msg ||
      e.message ||
      e.msg ||
      (typeof e.error === 'string' ? e.error : getRawMsg(e.error)) ||
      e.code ||
      ''
    );
  };

  const msg = getRawMsg(err) || def;

  if (ERROR_RESPONSE[msg]) {
    return ERROR_RESPONSE[msg].message;
  }

  // Axios special
  if (err?.errors && Array.isArray(err.errors) && err.errors.length > 0) {
    return err.errors[0].message;
  }

  // msg && console.log('error =>', msg);
  return replaceSensitiveText(msg);
};

export const getErrResponse = (err: any): any => {
  return err?.response?.data || err?.response || err;
};

export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}
