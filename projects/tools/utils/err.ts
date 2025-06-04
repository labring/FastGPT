import { replaceSensitiveText } from './string';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getErrText = (err: any, def = ''): string => {
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
