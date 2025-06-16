import * as crypto from 'crypto';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';

// 默认过期时间（24小时）
const DEFAULT_EXPIRATION = 24 * 60 * 60 * 1000;

/**
 * 生成签名链接
 * @param baseUrl 基础URL
 * @param secret 密钥
 * @param expirationMs 过期时间（毫秒）
 * @returns 带有签名和时间戳的URL
 */
export function generateSignedUrl(
  baseUrl: string,
  secret: string,
  expirationMs = DEFAULT_EXPIRATION
): string {
  // 生成时间戳
  const timestamp = Date.now();
  const expires = timestamp + expirationMs;

  // 计算签名
  const stringToSign = `${baseUrl}${timestamp}${expires}`;
  const signature = crypto.createHmac('sha256', secret).update(stringToSign).digest('hex');

  // 构建URL
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}timestamp=${timestamp}&expires=${expires}&signature=${signature}`;
}

/**
 * 验证签名URL
 * @param url 完整URL
 * @param secret 密钥
 * @returns 验证结果
 */
export function verifySignedUrl(url: string, secret: string): { valid: boolean; error?: string } {
  try {
    // 解析URL
    const urlObj = new URL(url);
    const params = urlObj.searchParams;

    // 获取参数
    const timestamp = params.get('timestamp');
    const expires = params.get('expires');
    const signature = params.get('signature');

    // 检查参数是否存在
    if (!timestamp || !expires || !signature) {
      return { valid: false, error: '缺少必要的验证参数' };
    }

    // 检查是否过期
    const now = Date.now();
    if (now > parseInt(expires)) {
      return { valid: false, error: '链接已过期' };
    }

    // 移除签名参数，获取基础URL用于签名验证
    params.delete('signature');
    const baseUrl = urlObj.toString();

    // 重新计算签名
    const stringToSign = `${baseUrl}${timestamp}${expires}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(stringToSign)
      .digest('hex');

    // 验证签名
    if (signature !== expectedSignature) {
      return { valid: false, error: '签名无效' };
    }

    return { valid: true };
  } catch (error) {
    console.error('验证签名URL时出错:', error);
    return { valid: false, error: '验证签名失败' };
  }
}

/**
 * 验证请求参数中的签名
 * @param params 请求参数
 * @param secret 密钥
 * @returns 验证结果
 */
export function verifyRequestSignature(
  params: {
    timestamp?: string | number;
    expires?: string | number;
    signature?: string;
    [key: string]: any;
  },
  secret: string,
  baseUrl?: string
): { valid: boolean; error?: string } {
  try {
    const { timestamp, expires, signature, ...otherParams } = params;

    // 检查参数是否存在
    if (!timestamp || !expires || !signature) {
      return { valid: false, error: '缺少必要的验证参数' };
    }

    // 检查是否过期
    const now = Date.now();
    const expiresNum = typeof expires === 'string' ? parseInt(expires) : expires;
    if (now > expiresNum) {
      return { valid: false, error: '链接已过期' };
    }

    // 构建用于签名的字符串
    let baseString = baseUrl || '';
    const timestampStr = typeof timestamp === 'number' ? timestamp.toString() : timestamp;
    const expiresStr = typeof expires === 'number' ? expires.toString() : expires;

    // 如果有其他参数，按字母顺序排序后添加到签名字符串
    if (Object.keys(otherParams).length > 0) {
      const sortedParams = Object.entries(otherParams).sort(([keyA], [keyB]) =>
        keyA.localeCompare(keyB)
      );
      for (const [key, value] of sortedParams) {
        baseString += `${key}=${value}`;
      }
    }

    // 添加时间戳和过期时间
    baseString += `${timestampStr}${expiresStr}`;

    // 计算预期签名
    const expectedSignature = crypto.createHmac('sha256', secret).update(baseString).digest('hex');

    // 验证签名
    if (signature !== expectedSignature) {
      return { valid: false, error: '签名无效' };
    }

    return { valid: true };
  } catch (error) {
    console.error('验证请求签名时出错:', error);
    return { valid: false, error: '验证签名失败' };
  }
}

/**
 * 简单鉴权函数 - 用于外部链接访问时验证URL参数
 * @param params URL参数
 * @param secret 密钥
 * @returns 验证结果
 */
export function authSimpleAccess(params: any, secret: string): Promise<{ valid: boolean }> {
  const result = verifyRequestSignature(params, secret);

  if (!result.valid) {
    console.log('简单鉴权失败:', result.error);
    return Promise.reject(OutLinkErrEnum.unAuthUser);
  }

  return Promise.resolve({ valid: true });
}
