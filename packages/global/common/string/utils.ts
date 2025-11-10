export const getTextValidLength = (chunk: string) => {
  return chunk.replaceAll(/[\s\n]/g, '').length;
};

export const isObjectId = (str: string) => {
  return /^[0-9a-fA-F]{24}$/.test(str);
};
