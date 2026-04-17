import { replaceSensitiveText } from '../string/tools';
import { ERROR_RESPONSE } from './errorCode';

export const getErrText = (err: any, def = ''): any => {
  const rawMsg =
    typeof err === 'string'
      ? err || def
      : err?.response?.data?.message ||
        err?.response?.message ||
        err?.message ||
        err?.response?.data?.msg ||
        err?.response?.msg ||
        err?.msg ||
        err?.error ||
        err?.code ||
        def;

  const msg = typeof rawMsg === 'string' ? rawMsg : String(rawMsg ?? '');

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

export class FileUploadError extends UserError {
  code: string;
  details?: Record<string, any>;

  constructor(code: string, message: string, details?: Record<string, any>) {
    super(message);
    this.name = 'FileUploadError';
    this.code = code;
    this.details = details;
  }
}
