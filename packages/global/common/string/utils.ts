export const getTextValidLength = (chunk: string) => {
  return chunk.replaceAll(/[\s\n]/g, '').length;
};

export const isObjectId = (str: string) => {
  return /^[0-9a-fA-F]{24}$/.test(str);
};

/** Shell 单参数安全转义，用于拼接传给 sandbox 的命令。 */
export const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;
