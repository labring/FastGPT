import type { NextApiRequest } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

/**
 * 验证管理员权限
 * 支持两种认证方式：
 * 1. Token认证 + isRoot标志
 * 2. Root key认证
 */
export async function authAdmin(
  req: NextApiRequest
): Promise<{ isRoot: boolean; userId?: string; teamId?: string; tmbId?: string }> {
  // 先尝试token认证，如果是root用户则允许
  try {
    const tokenAuth = await authCert({ req, authToken: true });

    if (tokenAuth.isRoot) {
      return {
        isRoot: true,
        userId: tokenAuth.userId,
        teamId: tokenAuth.teamId,
        tmbId: tokenAuth.tmbId
      };
    }
  } catch (tokenError) {
    // Token认证失败，继续尝试其他方式
  }

  // 如果token认证失败或不是root用户，尝试root key认证
  try {
    const rootAuth = await authCert({ req, authRoot: true });
    if (rootAuth.isRoot) {
      return {
        isRoot: true,
        userId: rootAuth.userId,
        teamId: rootAuth.teamId,
        tmbId: rootAuth.tmbId
      };
    }
  } catch (rootError) {
    console.log('Root key auth failed for admin check:', rootError);
  }

  // 两种认证方式都失败
  throw new Error('No admin permission');
}
