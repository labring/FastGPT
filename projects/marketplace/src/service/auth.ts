import { marketplaceEnv } from '@/env';
import {
  MarketplaceCommunitySource,
  MarketplaceOfficialSource
} from '@fastgpt/global/openapi/core/plugin/marketplace/api';

export const AUTH_TOKEN = marketplaceEnv.AUTH_TOKEN;
export const COMMUNITY_AUTH_TOKEN = marketplaceEnv.COMMUNITY_AUTH_TOKEN;

export type MarketplaceTokenIdentity = {
  source: typeof MarketplaceOfficialSource | typeof MarketplaceCommunitySource;
};

const getAuthorizationToken = (authorization: string | string[] | undefined) => {
  const rawAuthorization = Array.isArray(authorization) ? authorization[0] : authorization;
  return rawAuthorization?.startsWith('Bearer ')
    ? rawAuthorization.slice('Bearer '.length)
    : rawAuthorization;
};

/**
 * 解析提交插件使用的 marketplace token。
 * official token 只能产生 official 插件，community token 只能产生 community 插件。
 */
export const authenticateSubmitToken = (
  authorization: string | string[] | undefined
): MarketplaceTokenIdentity | null => {
  const token = getAuthorizationToken(authorization);

  if (AUTH_TOKEN && token === AUTH_TOKEN) {
    return {
      source: MarketplaceOfficialSource
    };
  }

  if (COMMUNITY_AUTH_TOKEN && token === COMMUNITY_AUTH_TOKEN) {
    return {
      source: MarketplaceCommunitySource
    };
  }

  return null;
};

/**
 * 校验 official token。revoke 等管理接口只允许 official token 调用。
 */
export const isOfficialToken = (authorization: string | string[] | undefined) => {
  const token = getAuthorizationToken(authorization);
  return Boolean(AUTH_TOKEN && token === AUTH_TOKEN);
};
