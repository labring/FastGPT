import { replaceSensitiveText } from '../string/tools';

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
        def;
  // msg && console.log('error =>', msg);
  return replaceSensitiveText(msg);
};
