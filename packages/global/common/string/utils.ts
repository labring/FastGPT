/**
 * 计算文本的有效长度（去除所有空白字符和换行符后的长度）
 *
 * @param chunk - 输入的字符串文本
 * @returns 去除空格和换行符后的字符数
 *
 * 说明：
 * - 使用正则表达式 /[\s\n]/g 匹配所有空白字符（包括空格、制表符、换行等）和换行符
 * - replaceAll 方法将这些字符全部移除
 * - 最后返回处理后字符串的长度
 */
export const getTextValidLength = (chunk: string) => {
  return chunk.replace(/[\s\n]/g, '').length;
};
