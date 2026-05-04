const emptyStringToUndefined = (value: string | undefined) => (value === '' ? undefined : value);

export const appClientEnv = {
  systemName: emptyStringToUndefined(process.env.SYSTEM_NAME) || 'AI',
  systemDescription: emptyStringToUndefined(process.env.SYSTEM_DESCRIPTION) || '',
  systemFavicon: emptyStringToUndefined(process.env.SYSTEM_FAVICON) || ''
};
