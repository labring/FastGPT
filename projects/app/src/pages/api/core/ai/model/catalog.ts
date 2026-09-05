import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getMemberModelCatalogPermission } from '@fastgpt/service/support/permission/model/controller';
import {
  GetModelCatalogQuerySchema,
  GetModelCatalogResponseSchema,
  type GetModelCatalogQuery,
  type GetModelCatalogResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { desensitizeSystemModel } from '@fastgpt/service/core/ai/config/utils';
import { resolveEffectiveDefaultModelIds } from '@fastgpt/service/core/ai/catalog';
import { authOutLink } from '@/service/support/permission/auth/outLink';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';

/** 返回当前成员完整模型目录；命中内容版本时只返回 version。 */
async function handler(
  req: ApiRequestProps<Record<string, never>, GetModelCatalogQuery>
): Promise<GetModelCatalogResponse> {
  const { version: clientVersion, outLinkAuthData } = parseApiInput({
    req,
    querySchema: GetModelCatalogQuerySchema
  }).query;

  /** 外链不能信任客户端成员 ID，只使用发布链接服务端保存的 team/tmb 身份。 */
  const catalogIdentity = await (async () => {
    if (outLinkAuthData) {
      const { outLinkConfig } = await authOutLink(outLinkAuthData);
      const teamId = String(outLinkConfig.teamId);
      const tmbId = String(outLinkConfig.tmbId);
      const tmb = await MongoTeamMember.findOne({ _id: tmbId, teamId }, 'role').lean();

      return {
        teamId,
        tmbId,
        isTeamOwner: tmb?.role === TeamMemberRoleEnum.owner
      };
    }

    const { teamId, tmbId, isRoot, tmb } = await authUserPer({
      req,
      authToken: true,
      per: ReadPermissionVal
    });
    return {
      teamId,
      tmbId,
      isTeamOwner: tmb.role === TeamMemberRoleEnum.owner || isRoot
    };
  })();
  const activeModels = global.systemActiveModelList;
  const configuredDefaults = global.systemConfiguredDefaultModelIds;
  const catalogVersion = global.systemModelCatalogVersion;
  const providers = global.ModelProviderRawCache;
  const permission = await getMemberModelCatalogPermission({
    ...catalogIdentity,
    catalogSnapshot: { models: activeModels, revision: global.systemModelRevision ?? 0 }
  });
  const version = `1:${catalogVersion}:${permission.version}`;

  if (clientVersion === version) {
    return GetModelCatalogResponseSchema.parse({ version });
  }

  const permittedModelIds = new Set(permission.modelIds);
  // 权限结果只决定可见性，目录顺序始终继承 plugin 排好的 active 模型列表。
  const models = activeModels.filter((model) => permittedModelIds.has(model.modelId));

  return GetModelCatalogResponseSchema.parse({
    version,
    data: {
      models: models.map(desensitizeSystemModel),
      providers,
      defaultModelIds: resolveEffectiveDefaultModelIds({
        models,
        configuredDefaults
      })
    }
  });
}

export default NextAPI(handler);
