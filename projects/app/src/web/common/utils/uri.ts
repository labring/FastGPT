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

/**
 * Validate if a URL is safe for internal redirect
 * Prevents open redirect vulnerabilities by ensuring the URL is a relative path
 * @param url The URL to validate
 * @param fallback The fallback URL to use if validation fails, defaults to '/dashboard/agent'
 * @returns A safe URL for redirect
 */
export const validateRedirectUrl = (url: string, fallback: string = '/dashboard/agent'): string => {
  if (!url) return fallback;

  const decodedUrl = safeDecodeURIComponent(url, fallback);

  // Check if URL is a relative path starting with /
  if (!decodedUrl.startsWith('/')) {
    console.warn('Invalid redirect URL (not starting with /): ', url);
    return fallback;
  }

  // Prevent redirect to login pages
  if (decodedUrl.includes('/login')) {
    console.warn('Redirect to login page is not allowed: ', url);
    return fallback;
  }

  // Check for common protocol patterns that indicate absolute URLs
  // This prevents URLs like //evil.com or /\evil.com
  if (decodedUrl.match(/^\/[\/\\]/)) {
    console.warn('Invalid redirect URL (protocol-relative or double slashes): ', url);
    return fallback;
  }

  // Check for javascript: or data: protocols
  if (decodedUrl.toLowerCase().match(/^[a-z]+:/)) {
    console.warn('Invalid redirect URL (contains protocol): ', url);
    return fallback;
  }

  return decodedUrl;
};
