import { NextAPI } from '@/service/middleware/entry';
import {
  ConfirmTeamUploadPkgPluginBodySchema,
  TeamPkgEmptyResponseSchema,
  type ConfirmTeamUploadPkgPluginBodyType,
  type TeamPkgEmptyResponseType
} from '@fastgpt/global/openapi/core/plugin/team/pkg/api';
import { TeamPluginInstallSourceEnum } from '@fastgpt/global/core/plugin/schema/type';
import { getTeamPluginSource } from '@fastgpt/global/core/app/tool/utils';
import { TeamManagePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  assertTeamPluginInstallEnabled,
  assertTeamPluginSourceReady,
  getRawPluginIdFromSystemToolId,
  upsertTeamInstalledPluginPolicy
} from '@fastgpt/service/core/plugin/teamPluginPolicy';
import { pluginClient } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps } from '@fastgpt/next/type';

export type ConfirmTeamUploadPkgPluginBody = ConfirmTeamUploadPkgPluginBodyType;
export type ConfirmTeamUploadPkgPluginResponse = TeamPkgEmptyResponseType;

async function handler(
  req: ApiRequestProps<ConfirmTeamUploadPkgPluginBody>
): Promise<ConfirmTeamUploadPkgPluginResponse> {
  assertTeamPluginInstallEnabled();

  const {
    body: { toolIds }
  } = parseApiInput({
    req,
    bodySchema: ConfirmTeamUploadPkgPluginBodySchema
  });

  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    per: TeamManagePermissionVal
  });

  const confirmResult = await pluginClient.confirmPlugin(
    toolIds.map((tool) => ({
      ...tool,
      pluginId: tool.pluginId.replace(/^systemTool-/, '')
    })),
    { source: getTeamPluginSource(teamId) }
  );

  if (confirmResult.failed.length > 0) {
    return Promise.reject(JSON.stringify(confirmResult.failed));
  }

  await assertTeamPluginSourceReady({
    teamId,
    tools: toolIds
  });
  await Promise.all(
    toolIds.map((tool) =>
      upsertTeamInstalledPluginPolicy({
        teamId,
        tmbId,
        pluginId: getRawPluginIdFromSystemToolId(tool.pluginId),
        version: tool.version,
        etag: tool.etag,
        installSource: TeamPluginInstallSourceEnum.upload,
        confirmedPermissions: tool.permission,
        packageSource: {
          uploadedFileName: tool.pluginId
        }
      })
    )
  );

  return TeamPkgEmptyResponseSchema.parse(undefined);
}

export default NextAPI(handler);
