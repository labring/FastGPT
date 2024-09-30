export const strToBase64 = (str: string, prefix: string = '') => {
  const base64_string = Buffer.from(str, 'utf-8').toString('base64');

  return `${prefix}${base64_string}`;
};
