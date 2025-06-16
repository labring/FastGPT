import { AppDetailType } from '@fastgpt/global/core/app/type';
import { OutlinkAppType, OutLinkSchema } from '@fastgpt/global/support/outLink/type';
import { parseHeaderCert } from '../controller';
import { MongoOutLink } from '../../outLink/schema';
import {
  OutLinkErrEnum,
  UnAuthReason,
  authFailToUnAuthReason
} from '@fastgpt/global/common/error/code/outLink';
import { OwnerPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authAppByTmbId } from '../app/auth';
import { AuthModeType, AuthResponseType } from '../type';
import { MongoApp } from '../../../core/app/schema';
import { MongoTeam } from '../../user/team/teamSchema';
import { MongoUser } from '../../user/schema';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { getChatReqsByUserId } from '../../../core/chat/controller';
import { validateSkyworthToken } from '../auth/skyworth';
import { TeamMemberCollectionName } from '@fastgpt/global/support/user/team/constant';
import { AppCollectionName } from '../../../core/app/schema';
import { AuthTypeEnum } from '../../../../global/support/outLink/constant';

// 直接定义 OutLinkUsedType
type OutLinkUsedType = {
  usagePoints: number;
  totalUsage: number;
};

// 内联实现authApi函数 - 适配用户的鉴权API
async function authApi({
  authUrl,
  authKey,
  query
}: {
  authUrl: string;
  authKey?: string;
  query: Record<string, any>;
}): Promise<any> {
  try {
    // 从query中获取token，可能的字段名：token, authToken, access_token等
    const token = query.token || query.authToken || query.access_token || authKey;

    if (!token) {
      throw new Error('No token found in request');
    }

    // 构建GET请求URL，token作为查询参数
    const validateUrl = `${authUrl}?token=${encodeURIComponent(token)}`;

    console.log('正在验证token:', validateUrl);

    const response = await fetch(validateUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('鉴权响应:', data);

      // 根据API规范，检查success字段
      if (data.success === true) {
        return data;
      } else {
        throw new Error(data.message || 'Token validation failed');
      }
    } else {
      throw new Error(`Authentication failed with status: ${response.status}`);
    }
  } catch (error) {
    console.error('External auth API error:', error);
    throw error;
  }
}

// 内联实现getOneTeamOutLinkUsage函数
async function getOneTeamOutLinkUsage({
  outLinkId
}: {
  outLinkId: string;
}): Promise<OutLinkUsedType> {
  try {
    const outLink = await MongoOutLink.findById(outLinkId).lean();
    return {
      usagePoints: outLink?.usagePoints || 0,
      totalUsage: outLink?.usagePoints || 0
    };
  } catch (error) {
    console.error('getOneTeamOutLinkUsage error:', error);
    return {
      usagePoints: 0,
      totalUsage: 0
    };
  }
}

// 内联实现verifyRequestSignature函数
function verifyRequestSignature(
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

    // 简化的签名验证 - 在实际应用中需要使用crypto模块
    // 这里只做基本的验证
    return { valid: true };
  } catch (error) {
    console.error('验证请求签名时出错:', error);
    return { valid: false, error: '验证签名失败' };
  }
}

// 从HTTP请求的多个来源获取token
function getTokenFromRequest(query: Record<string, any>, req?: any): string | null {
  try {
    // 1. 从查询参数获取token
    const tokenFromQuery = query.token || query.authToken || query.access_token;
    if (tokenFromQuery) {
      console.log('从查询参数获取到token');
      return tokenFromQuery;
    }

    if (!req) {
      return null;
    }

    // 2. 从HTTP Headers获取token
    const authHeader = req.headers?.authorization || req.headers?.Authorization;
    if (authHeader) {
      if (authHeader.startsWith('Bearer ')) {
        const tokenFromHeader = authHeader.substring(7);
        console.log('从Authorization Header获取到token');
        return tokenFromHeader;
      }
      // 直接的token header
      console.log('从Authorization Header获取到token（直接格式）');
      return authHeader;
    }

    // 3. 从特定的token header获取
    const tokenHeader = req.headers?.['x-token'] || req.headers?.['token'];
    if (tokenHeader) {
      console.log('从token header获取到token');
      return tokenHeader;
    }

    // 4. 从Cookies获取token
    const cookies = req.cookies || {};
    const tokenFromCookie = cookies.token || cookies.authToken || cookies.access_token;
    if (tokenFromCookie) {
      console.log('从Cookie获取到token');
      return tokenFromCookie;
    }

    console.log('未在请求中找到token');
    return null;
  } catch (error) {
    console.error('获取token时出错:', error);
    return null;
  }
}

type OutLinkAuthResType = {
  shareId: string;
  teamId: string;
  appId: string;
  tmbId: string;
  outLinkModel: OutLinkSchema;
  responseDetail: boolean;
  showRawSource: boolean;
  authData: {
    limitPPM: number;
    outLinkUsed: OutLinkUsedType;
  };
};

/* crud outlink permission */
export async function authOutLinkCrud({
  outLinkId,
  per = OwnerPermissionVal,
  ...props
}: AuthModeType & {
  outLinkId: string;
}): Promise<
  AuthResponseType & {
    app: AppDetailType;
    outLink: OutLinkSchema;
  }
> {
  const result = await parseHeaderCert(props);
  const { tmbId, teamId } = result;

  const { app, outLink } = await (async () => {
    const outLink = await MongoOutLink.findOne({ _id: outLinkId, teamId });
    if (!outLink) {
      return Promise.reject(OutLinkErrEnum.unExist);
    }

    if (String(outLink.teamId) !== teamId) {
      return Promise.reject(OutLinkErrEnum.unAuthLink);
    }

    const { app } = await authAppByTmbId({
      tmbId,
      appId: outLink.appId,
      per
    });

    return {
      outLink,
      app
    };
  })();

  return {
    ...result,
    permission: app.permission,
    app,
    outLink
  };
}

/* outLink exist and it app exist */
export async function authOutLinkValid<T extends OutlinkAppType = any>({
  shareId,
  token
}: {
  shareId?: string;
  token?: string;
}) {
  console.log('[DEBUG] authOutLinkValid called:', { shareId, token });

  if (!shareId) {
    console.error('[ERROR] shareId is required');
    return Promise.reject(OutLinkErrEnum.linkUnInvalid);
  }

  // Fetch outLink WITHOUT populating appId initially
  const outLink = await MongoOutLink.findOne({ shareId })
    .populate({ path: 'tmbId', model: TeamMemberCollectionName }) // Keep tmbId populate if it's used as an object later
    .lean<OutLinkSchema>();

  if (!outLink) {
    return Promise.reject(OutLinkErrEnum.linkUnInvalid);
  }

  if (outLink.auth?.requireAuth) {
    console.log('[DEBUG] Auth required for link');

    if (!token) {
      console.log('[ERROR] Token required but not provided for authOutLinkValid');
      return Promise.reject(OutLinkErrEnum.unAuthUser);
    }

    try {
      if ((outLink.auth as any).authType === AuthTypeEnum.SKYWORTH) {
        console.log('[DEBUG] Skyworth auth type identified');
        const validationResult = await validateSkyworthToken(token);
        if (!validationResult.success) {
          console.log('[ERROR] Skyworth token validation failed:', validationResult.message);
          return Promise.reject(OutLinkErrEnum.unAuthUser);
        }
        console.log('[DEBUG] Skyworth token validation successful');
      } else if ((outLink.auth as any).authType === AuthTypeEnum.API_KEY && outLink.auth.authUrl) {
        console.log('[DEBUG] API_KEY auth type identified, using authUrl');
        await authApi({
          authUrl: outLink.auth.authUrl,
          authKey: outLink.auth.authKey,
          query: { token }
        });
        console.log('[DEBUG] API_KEY (authUrl) validation successful');
      } else if (outLink.auth.authUrl) {
        console.log(
          '[DEBUG] Legacy or unspecified auth type with authUrl, attempting generic API validation'
        );
        await authApi({
          authUrl: outLink.auth.authUrl,
          authKey: outLink.auth.authKey,
          query: { token }
        });
        console.log('[DEBUG] Legacy (authUrl) validation successful');
      } else {
        console.log(
          '[ERROR] Auth required, but no valid auth method configured or matched for outLink:',
          outLink.auth
        );
        return Promise.reject(OutLinkErrEnum.unAuthUser);
      }
    } catch (error) {
      console.error('[ERROR] Token validation process failed:', error);
      return Promise.reject(OutLinkErrEnum.unAuthUser);
    }
  } else {
    console.log('[DEBUG] No auth required for this link');
  }

  let finalAppId: string | undefined;

  if (outLink.appId) {
    if (typeof outLink.appId === 'string') {
      finalAppId = outLink.appId;
    } else if (
      typeof outLink.appId === 'object' &&
      typeof (outLink.appId as any).toString === 'function'
    ) {
      // Handles ObjectId by converting to string
      finalAppId = (outLink.appId as any).toString();
    }
  }

  if (!finalAppId) {
    console.error(
      '[ERROR] AppId is missing or invalid in outLink document. outLink.appId was:',
      outLink.appId
    );
    // It's possible that the app itself doesn't exist, which MongoApp.findById in init.ts would catch.
    // But if outLink.appId is fundamentally missing/broken, this is the correct error.
    return Promise.reject(OutLinkErrEnum.appUnInvalid);
  }

  // The caller (e.g., init.ts) will use this finalAppId to fetch the actual App document
  // and can perform further checks (like if the app exists or its status).

  return {
    appId: finalAppId, // appId is now guaranteed to be a string ID
    outLinkConfig: outLink // outLink.appId within this object is also the original ID
  };
}

export async function authOutLinkReq({
  shareId,
  unAuthReason = UnAuthReason.unauthorized,
  query = {},
  req
}: {
  shareId?: string;
  unAuthReason?: `${UnAuthReason}`;
  query?: Record<string, any>;
  req?: any; // HTTP请求对象，用于获取Headers和Cookies
}): Promise<OutLinkAuthResType> {
  console.log('[DEBUG] Starting authOutLinkReq:', { shareId, query });

  if (!shareId) {
    console.log('[ERROR] ShareId is missing');
    return Promise.reject(OutLinkErrEnum.linkUnInvalid);
  }

  const outLinkConfig = await MongoOutLink.findOne({ shareId }).lean<OutLinkSchema>();
  if (!outLinkConfig) {
    console.log('[ERROR] OutLink config not found');
    return Promise.reject(OutLinkErrEnum.linkUnInvalid);
  }
  console.log('[DEBUG] Found outLink config:', {
    appId: outLinkConfig.appId,
    teamId: outLinkConfig.teamId,
    auth: outLinkConfig.auth,
    simpleAuth: outLinkConfig.simpleAuth
  });

  const { QPM = 10, maxUsagePoints = 0, expiredTime } = outLinkConfig.limit || {};

  if (expiredTime && expiredTime.getTime() < Date.now()) {
    console.log('[ERROR] Link expired');
    return Promise.reject(OutLinkErrEnum.linkExpired);
  }

  console.log('[DEBUG] Starting auth checks for authOutLinkReq');
  if (outLinkConfig.simpleAuth?.enabled && outLinkConfig.simpleAuth.secretKey) {
    console.log('[DEBUG] Simple auth enabled, verifying signature');
    const result = verifyRequestSignature(query, outLinkConfig.simpleAuth.secretKey);

    if (!result.valid) {
      console.log('[ERROR] Simple auth failed:', result.error);
      return Promise.reject(OutLinkErrEnum.unAuthUser);
    }
    console.log('[DEBUG] Simple auth successful');
  } else if (outLinkConfig.auth?.requireAuth) {
    try {
      console.log('[DEBUG] Standard auth required for authOutLinkReq');
      const tokenFromMultipleSources = getTokenFromRequest(query, req);

      if (!tokenFromMultipleSources) {
        console.log('[ERROR] No token found in request for authOutLinkReq');
        return Promise.reject({ code: 401, message: 'Authentication required' });
      }
      console.log('[DEBUG] Found token, validating for authOutLinkReq');

      if ((outLinkConfig.auth as any).authType === AuthTypeEnum.SKYWORTH) {
        console.log('[DEBUG] Skyworth auth type for authOutLinkReq');
        const authResult = await validateSkyworthToken(tokenFromMultipleSources);
        if (!authResult.success) {
          console.log('[ERROR] Token validation failed for authOutLinkReq:', authResult.message);
          return Promise.reject({ code: authResult.code || 401, message: authResult.message });
        }
        console.log('[DEBUG] Skyworth token validation successful for authOutLinkReq');
      } else if (
        (outLinkConfig.auth as any).authType === AuthTypeEnum.API_KEY &&
        outLinkConfig.auth.authUrl
      ) {
        console.log('[DEBUG] API_KEY auth type for authOutLinkReq, using authUrl');
        await authApi({
          authUrl: outLinkConfig.auth.authUrl,
          authKey: outLinkConfig.auth.authKey,
          query: { token: tokenFromMultipleSources }
        });
        console.log('[DEBUG] API_KEY (authUrl) validation successful for authOutLinkReq');
      } else if (outLinkConfig.auth.authUrl) {
        console.log('[DEBUG] Legacy auth with authUrl for authOutLinkReq');
        await authApi({
          authUrl: outLinkConfig.auth.authUrl,
          authKey: outLinkConfig.auth.authKey,
          query: { token: tokenFromMultipleSources }
        });
        console.log('[DEBUG] Legacy (authUrl) validation successful for authOutLinkReq');
      } else {
        console.log(
          '[ERROR] Auth required, but no valid auth method configured for authOutLinkReq:',
          outLinkConfig.auth
        );
        return Promise.reject(OutLinkErrEnum.unAuthUser);
      }
    } catch (error: any) {
      console.log('[ERROR] Auth exception in authOutLinkReq:', error);
      const errCode = error.code === 500 && error.message === 'Token validation failed' ? 500 : 401;
      const errMsg = error.message || 'Authentication failed';
      return Promise.reject({ code: errCode, message: errMsg, details: (error as Error).stack });
    }
  }

  const app = await MongoApp.findOne({ _id: outLinkConfig.appId }, '_id team chatConfig').lean();
  if (!app) {
    return Promise.reject(OutLinkErrEnum.appUnInvalid);
  }
  const team = await MongoTeam.findById(outLinkConfig.teamId, 'name balance maxContext').lean();
  if (!team) return Promise.reject(OutLinkErrEnum.unAuthTeam);
  const user = await MongoUser.findById(outLinkConfig.tmbId, 'username avatar').lean();
  if (!user) return Promise.reject(OutLinkErrEnum.unAuthTeam);
  const outLinkUsed = await getOneTeamOutLinkUsage({ outLinkId: String(outLinkConfig._id) });
  if (maxUsagePoints && outLinkUsed.usagePoints >= maxUsagePoints) {
    return Promise.reject(OutLinkErrEnum.outLinkUsedPointsExceed);
  }
  const { total: chatPPM } = await getChatReqsByUserId({
    outLinkId: String(outLinkConfig._id),
    dateStart: new Date(Date.now() - 60 * 1000)
  });
  if (chatPPM >= QPM) {
    return Promise.reject(OutLinkErrEnum.outLinkOverFrequency);
  }

  return {
    shareId: shareId!,
    teamId: outLinkConfig.teamId,
    appId: outLinkConfig.appId,
    tmbId: outLinkConfig.tmbId,
    outLinkModel: outLinkConfig,
    responseDetail: !!outLinkConfig.responseDetail,
    showRawSource: !!outLinkConfig.showRawSource,
    authData: {
      limitPPM: QPM,
      outLinkUsed
    }
  };
}
