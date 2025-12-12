/**
 * 安全的 URI 解码函数，包含异常处理
 * @param encodedString 需要解码的字符串
 * @param fallback 解码失败时的默认值，默认为 '/dashboard/agent'
 * @returns 解码后的字符串或默认值
 */
export const safeDecodeURIComponent = (
  encodedString: string,
  fallback: string = '/dashboard/agent'
): string => {
  if (!encodedString) return fallback;

  try {
    return decodeURIComponent(encodedString);
  } catch (error) {
    console.warn('Invalid URI encoding in string:', encodedString, error);
    return fallback;
  }
};

/**
 * 安全的 URI 编码函数
 * @param string 需要编码的字符串
 * @returns 编码后的字符串
 */
export const safeEncodeURIComponent = (str: string): string => {
  try {
    return encodeURIComponent(str);
  } catch (error) {
    console.warn('Error encoding string:', str, error);
    return '';
  }
};
