import type { NextApiRequest, NextApiResponse } from 'next';
import { setCookie } from '@fastgpt/service/support/permission/controller';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { NextAPI } from '@/service/middleware/entry';
import { authUserSession } from '@fastgpt/service/support/user/session';

/**
 * Token登录并重定向接口
 *
 * 用法:
 * GET /api/support/user/account/tokenLoginRedirect?token=YOUR_TOKEN&redirect=/chat?pane=ra&appId=xxx
 *
 * 功能:
 * 1. 接收token参数
 * 2. 验证token有效性（验证Redis session是否存在且有效）
 * 3. 设置fastgpt_token cookie
 * 4. 重定向到指定URL
 *
 * 安全限制:
 * - 验证token是否为有效的session（防止认证绕过）
 * - 只允许重定向到白名单内的路径前缀
 * - 防止开放重定向漏洞
 */

// 允许的重定向路径白名单
const ALLOWED_REDIRECT_PREFIXES = [
  '/login',
  '/account/',
  '/app/',
  '/chat',
  '/dashboard/',
  '/dataset/',
  '/api/'
];

/**
 * 验证重定向URL是否安全
 * @param url 要验证的URL
 * @returns 是否为安全的重定向目标
 */
function isValidRedirectUrl(url: string): boolean {
  // 必须是相对路径（以 / 开头，但不是 // 开头）
  if (!url.startsWith('/') || url.startsWith('//')) {
    return false;
  }

  // 不允许包含协议（防止绕过）
  if (url.includes('://') || url.includes('\\')) {
    return false;
  }

  // 提取路径部分（去除查询参数和哈希）
  const path = url.split('?')[0].split('#')[0];

  // 检查是否匹配白名单前缀
  return ALLOWED_REDIRECT_PREFIXES.some((prefix) => 
    path === prefix || path.startsWith(prefix)
  );
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { token, redirect = '/dashboard/apps' } = req.query;

  // 验证token参数
  if (!token || typeof token !== 'string') {
    return Promise.reject(CommonErrEnum.invalidParams);
  }

  const redirectUrl = typeof redirect === 'string' ? redirect : '/dashboard/apps';

  // 验证重定向URL安全性
  if (!isValidRedirectUrl(redirectUrl)) {
    return Promise.reject('Invalid redirect URL');
  }

  // 验证token有效性（从Redis session中验证）
  await authUserSession(token);

  // 设置fastgpt_token cookie
  setCookie(res, token);

  // 重定向到目标URL
  res.redirect(302, redirectUrl);
}

export default NextAPI(handler);

