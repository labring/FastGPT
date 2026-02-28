export const getErrText = (err: any, def = ''): any => {
  const msg: string =
    typeof err === 'string'
      ? err || def
      : err?.response?.data?.message ||
        err?.response?.message ||
        err?.message ||
        err?.response?.data?.msg ||
        err?.response?.msg ||
        err?.msg ||
        err?.error ||
        def;

  // Axios special
  if (err?.errors && Array.isArray(err.errors) && err.errors.length > 0) {
    return err.errors[0].message;
  }

  // msg && console.log('error =>', msg);
  return msg;
};
