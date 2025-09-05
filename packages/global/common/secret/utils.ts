export const isSecretValue = (val: any) => {
  return typeof val === 'object' && val !== null && !!val.secret;
};
