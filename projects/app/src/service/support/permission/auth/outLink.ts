import { POST, GET } from '@fastgpt/service/common/api/plusRequest';
import type {
  AuthOutLinkChatProps,
  AuthOutLinkLimitProps,
  AuthOutLinkInitProps,
  AuthOutLinkResponse
} from '@fastgpt/global/support/outLink/api.d';
import { ShareChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { authOutLinkValid } from '@fastgpt/service/support/permission/publish/authLink';
import { getUserChatInfoAndAuthTeamPoints } from '@fastgpt/service/support/permission/auth/team';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { OutLinkErrEnum } from '@fastgpt/global/common/error/code/outLink';
import { OutLinkSchema } from '@fastgpt/global/support/outLink/type';

// 存储鉴权会话信息的缓存
// 键是outLinkUid，值是包含过期时间的会话对象
const authSessionCache = new Map<string, { expiresAt: number }>();

// 从HTTP请求的多个来源获取token
export function getTokenFromRequest(req: any): string | null {
  try {
    if (!req) {
      console.log('[DEBUG] getTokenFromRequest: req object is null');
      return null;
    }

    const { query = {}, headers = {}, cookies = {} } = req;
    console.log('[DEBUG] Attempting to extract token from request:', {
      query,
      headers: {
        authorization: headers.authorization,
        Authorization: headers.Authorization,
        'x-token': headers['x-token'],
        token: headers.token,
        'auth-token': headers['auth-token']
      },
      cookies
    });

    // 1. 从查询参数获取token
    const tokenFromQuery = query.token || query.authToken || query.access_token;
    if (tokenFromQuery) {
      console.log('[SUCCESS] Token found in query parameter:', tokenFromQuery);
      return tokenFromQuery;
    }

    // 2. 从HTTP Headers获取token
    const authHeader = headers?.authorization || headers?.Authorization;
    if (authHeader) {
      if (authHeader.startsWith('Bearer ')) {
        const tokenFromHeader = authHeader.substring(7);
        console.log('[SUCCESS] Token found in "Authorization" header (Bearer):', tokenFromHeader);
        return tokenFromHeader;
      }
      console.log('[SUCCESS] Token found in "Authorization" header (direct):', authHeader);
      return authHeader;
    }

    // 3. 从特定的token header获取
    const tokenHeader = headers?.['x-token'] || headers?.['token'] || headers?.['auth-token'];
    if (tokenHeader) {
      console.log(
        '[SUCCESS] Token found in custom header (x-token/token/auth-token):',
        tokenHeader
      );
      return tokenHeader;
    }

    // 4. 从Cookies获取token
    const tokenFromCookie = cookies.token || cookies.authToken || cookies.access_token;
    if (tokenFromCookie) {
      console.log('[SUCCESS] Token found in cookie:', tokenFromCookie);
      return tokenFromCookie;
    }

    console.log('[INFO] Token not found in any standard location.');
    return null;
  } catch (error) {
    console.error('获取token时出错:', error);
    return null;
  }
}

export function authOutLinkChatLimit(data: AuthOutLinkLimitProps): Promise<AuthOutLinkResponse> {
  // 无论是否Plus版本都启用鉴权
  return POST<AuthOutLinkResponse>('/api/core/chat/outLink/chatStart', data);
}

// 从鉴权URL获取鉴权结果 - 适配用户的鉴权API规范
async function fetchAuthResult(
  authUrl: string,
  authKey: string,
  token: string
): Promise<{ success: boolean; expiresAt?: number }> {
  try {
    // 根据环境使用不同的认证服务地址
    const baseUrl =
      process.env.NODE_ENV === 'production'
        ? 'http://172.28.17.114' // 生产环境使用 IP
        : 'http://192.168.8.194'; // 测试环境

    // 构建GET请求URL，token作为查询参数
    const validateUrl = `${baseUrl}/api/ky/sys/validate-token?token=${encodeURIComponent(token)}`;
    console.log('[DEBUG] Validating token with URL:', validateUrl);

    const response = await fetch(validateUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.log('[ERROR] Token validation failed:', response.status);
      return { success: false };
    }

    const data = await response.json();
    console.log('[DEBUG] Token validation response:', data);

    // 根据 Skyworth API 规范，检查 success 字段
    if (data.success === true) {
      // 从响应中获取过期时间，如果没有则使用默认值（2小时）
      const expiresAt = data.result?.exp ? data.result.exp * 1000 : Date.now() + 2 * 60 * 60 * 1000;
      return {
        success: true,
        expiresAt
      };
    } else {
      console.error('[ERROR] Auth failed:', data.message);
      return { success: false };
    }
  } catch (error) {
    console.error('[ERROR] Auth request failed:', error);
    return { success: false };
  }
}

export const authOutLink = async ({
  shareId,
  outLinkUid,
  token
}: ShareChatAuthProps & {
  token?: string; // 用户提供的鉴权token
}): Promise<{
  uid: string;
  appId: string;
  outLinkConfig: OutLinkSchema;
}> => {
  if (!outLinkUid) {
    return Promise.reject(OutLinkErrEnum.linkUnInvalid);
  }
  if (!shareId) {
    return Promise.reject(OutLinkErrEnum.linkUnInvalid);
  }
  const result = await authOutLinkValid({ shareId, token });

  console.log('鉴权配置:', result.outLinkConfig.auth);

  // 检查是否需要鉴权
  if (result.outLinkConfig.auth?.requireAuth && result.outLinkConfig.auth.authUrl) {
    console.log('需要进行鉴权验证');

    // 如果没有提供token，则拒绝访问
    if (!token) {
      console.log('鉴权失败：未提供token');
      return Promise.reject(OutLinkErrEnum.unAuthUser);
    }

    const authResult = await fetchAuthResult(
      result.outLinkConfig.auth.authUrl,
      result.outLinkConfig.auth.authKey || '',
      token // 使用用户提供的token
    );

    if (!authResult.success) {
      console.log('鉴权失败，拒绝访问');
      return Promise.reject(OutLinkErrEnum.unAuthUser);
    }
    console.log('鉴权成功');

    // 如果鉴权成功，并且服务器返回了过期时间，则记录到缓存中
    if (authResult.expiresAt) {
      authSessionCache.set(outLinkUid, { expiresAt: authResult.expiresAt });
      console.log(`已设置鉴权会话，过期时间: ${new Date(authResult.expiresAt).toISOString()}`);
    } else {
      // 如果服务器没有返回过期时间，设置默认过期时间（2小时）
      const defaultExpiresAt = Date.now() + 2 * 60 * 60 * 1000;
      authSessionCache.set(outLinkUid, { expiresAt: defaultExpiresAt });
      console.log(`已设置默认鉴权会话，过期时间: ${new Date(defaultExpiresAt).toISOString()}`);
    }
  } else {
    console.log('无需鉴权，原因:', {
      requireAuth: result.outLinkConfig.auth?.requireAuth,
      hasAuthUrl: !!result.outLinkConfig.auth?.authUrl
    });
  }

  return {
    ...result,
    uid: outLinkUid
  };
};

// 检查鉴权会话是否有效
async function checkAuthSession(shareId: string, outLinkUid: string): Promise<boolean> {
  // 获取鉴权会话
  const session = authSessionCache.get(outLinkUid);

  // 如果会话不存在，则需要重新鉴权
  if (!session) {
    console.log('鉴权会话不存在，需要重新鉴权');
    return false;
  }

  // 检查会话是否过期
  if (Date.now() > session.expiresAt) {
    console.log('鉴权会话已过期，需要重新鉴权');
    // 删除过期会话
    authSessionCache.delete(outLinkUid);
    return false;
  }

  console.log(`鉴权会话有效，过期时间: ${new Date(session.expiresAt).toISOString()}`);
  return true;
}

export async function authOutLinkChatStart({
  shareId,
  ip,
  outLinkUid,
  question,
  token
}: AuthOutLinkChatProps & {
  shareId: string;
  token?: string; // 用户提供的鉴权token
}) {
  // 获取outLink和app信息
  const { outLinkConfig, appId } = await authOutLinkValid({ shareId });

  // 只获取基本的用户信息，不进行额外的权限检查
  const { timezone, externalProvider } = await getUserChatInfoAndAuthTeamPoints(
    outLinkConfig.tmbId
  );

  // 直接使用传入的outLinkUid，或生成一个新的
  const uid = outLinkUid || 'anonymous_' + Date.now();

  console.log('[SUCCESS] authOutLinkChatStart completed, uid:', uid);

  return {
    sourceName: outLinkConfig.name,
    teamId: outLinkConfig.teamId,
    tmbId: outLinkConfig.tmbId,
    authType: AuthUserTypeEnum.token,
    responseDetail: outLinkConfig.responseDetail,
    showNodeStatus: outLinkConfig.showNodeStatus,
    timezone,
    externalProvider,
    appId,
    uid
  };
}

// 添加 outLinkChatCB 函数
export function outLinkChatCB({
  res,
  responseData,
  detail,
  messages
}: {
  res: any;
  responseData: any;
  detail?: boolean;
  messages?: any[];
}) {
  // 如果不需要详细信息，只返回基本响应
  if (!detail) {
    return {
      responseData: {
        id: responseData.id,
        content: responseData.content,
        role: responseData.role
      }
    };
  }

  // 如果需要详细信息，返回完整响应
  return {
    responseData: {
      ...responseData,
      messages: messages || []
    }
  };
}
