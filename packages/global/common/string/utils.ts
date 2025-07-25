export const getTextValidLength = (chunk: string) => {
  return chunk.replaceAll(/[\s\n]/g, '').length;
};
