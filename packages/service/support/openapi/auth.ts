import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { updateApiKeyUsedTime } from './tools';
import { MongoOpenApi } from './schema';
import type { OpenApiSchema } from '@fastgpt/global/support/openapi/type';
import { UserError } from '@fastgpt/global/common/error/utils';
import { isProVersion } from '../../common/system/constants';
import { ApiKeyTypeEnum } from '@fastgpt/global/support/openapi/constants';
import { resolveApiKeyScope } from './utils';
import { MongoApp } from '../../core/app/schema';
import { MongoTeam } from '../user/team/teamSchema';
import { MongoTeamMember } from '../user/team/teamMemberSchema';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { AppTypeList } from '@fastgpt/global/core/app/constants';

const ApiKeyAppIdCredentialReg = /^(.+)-([a-fA-F0-9]{24})$/;

/**
 * 解析开放接口 Authorization 中的 APIKey 凭证。
 *
 * `apiKey-appId` 仅用于 OpenAI SDK 兼容，后缀必须是 24 位 ObjectId；
 * 命中时只用真实 APIKey 查库，`parsedAppId` 作为 completions 的 appId 兜底来源。
 */
export function resolveOpenApiCredential(rawCredential: string) {
  const credential = rawCredential.trim();
  const match = credential.match(ApiKeyAppIdCredentialReg);

  if (!match) {
    return {
      apikey: credential,
      parsedAppId: ''
    };
  }

  return {
    apikey: match[1],
    parsedAppId: match[2]
  };
}

/** 校验商业版 API Key 的有效期和用量额度；缺省或 -1 表示不限，0 仍是有效上限。 */
export function assertOpenApiLimit(openApi: OpenApiSchema) {
  if (openApi.limit?.expiredTime && new Date(openApi.limit.expiredTime).getTime() < Date.now()) {
    throw new UserError('API Key is expired');
  }
  const maxUsagePoints = openApi.limit?.maxUsagePoints ?? -1;
  if (maxUsagePoints > -1 && openApi.usagePoints > maxUsagePoints) {
    throw new UserError('API Key is over usage');
  }
}

export async function authOpenApiKey({
  apikey,
  authApiKey = true,
  authAppApiKey = false
}: {
  apikey: string;
  authApiKey?: boolean;
  authAppApiKey?: boolean;
}) {
  if (!apikey) {
    return Promise.reject(ERROR_ENUM.unAuthApiKey);
  }
  try {
    if (!authApiKey && !authAppApiKey) {
      return Promise.reject(ERROR_ENUM.unAuthApiKey);
    }

    const { apikey: realApiKey, parsedAppId } = resolveOpenApiCredential(apikey);
    const openApi = await MongoOpenApi.findOne({ apiKey: realApiKey }).lean();
    if (!openApi) {
      return Promise.reject(ERROR_ENUM.unAuthApiKey);
    }

    const scope = resolveApiKeyScope(openApi);
    if (scope.type === ApiKeyTypeEnum.app ? !authAppApiKey : !authApiKey) {
      throw ERROR_ENUM.unAuthApiKey;
    }
    if (scope.type === ApiKeyTypeEnum.app) {
      // 应用凭证独立于成员 ACL/活跃状态；归属记录仍须在同一有效团队内，不能悬空或跨租户。
      const [team, member] = await Promise.all([
        MongoTeam.exists({ _id: openApi.teamId, deleteTime: null }),
        MongoTeamMember.exists({ _id: openApi.tmbId, teamId: openApi.teamId })
      ]);
      if (!team || !member) throw ERROR_ENUM.unAuthApiKey;
    }

    if (isProVersion()) {
      assertOpenApiLimit(openApi);
    }

    updateApiKeyUsedTime(openApi._id);

    return {
      apikey: realApiKey,
      apiKeyId: String(openApi._id),
      teamId: String(openApi.teamId),
      tmbId: String(openApi.tmbId),
      apiKeyType: scope.type,
      boundAppId: scope.type === ApiKeyTypeEnum.app ? scope.appId : undefined,
      legacyAppId: scope.type === ApiKeyTypeEnum.app ? scope.appId : (scope.defaultAppId ?? ''),
      parsedAppId,
      authProxy: scope.type === ApiKeyTypeEnum.personal && !!openApi.authProxy,
      sourceName: openApi.name
    };
  } catch (error) {
    return Promise.reject(error);
  }
}

/** 应用 Key 的绑定是唯一目标；忽略调用方 appId/SDK 后缀，只校验绑定应用及团队，不授予成员 ACL。 */
export const getAppByApiKey = async ({
  teamId,
  boundAppId
}: {
  teamId: string;
  boundAppId?: string;
}) => {
  if (!boundAppId) throw AppErrEnum.unAuthApp;
  const app = await MongoApp.findOne({ _id: boundAppId, teamId, deleteTime: null }).lean();
  if (!app || !AppTypeList.includes(app.type)) throw AppErrEnum.unExist;
  return app;
};
