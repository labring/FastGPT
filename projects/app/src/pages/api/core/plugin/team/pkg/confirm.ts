import { NextAPI } from '@/service/middleware/entry';
import {
  ConfirmTeamUploadPkgPluginBodySchema,
  TeamPkgEmptyResponseSchema,
  type ConfirmTeamUploadPkgPluginBodyType,
  type TeamPkgEmptyResponseType
} from '@fastgpt/global/openapi/core/plugin/team/pkg/api';
import { TeamPluginInstallSourceEnum } from '@fastgpt/global/core/plugin/schema/type';
import { TeamPluginManagePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  assertTeamPluginSourceReady,
  getRawPluginIdFromSystemToolId,
  upsertTeamInstalledPluginPolicy
} from '@fastgpt/service/core/plugin/teamPluginPolicy';
import { confirmPluginToSource } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps } from '@fastgpt/next/type';

export type ConfirmTeamUploadPkgPluginBody = ConfirmTeamUploadPkgPluginBodyType;
export type ConfirmTeamUploadPkgPluginResponse = TeamPkgEmptyResponseType;

async function handler(
  req: ApiRequestProps<ConfirmTeamUploadPkgPluginBody>
): Promise<ConfirmTeamUploadPkgPluginResponse> {
  if (global.feConfigs.enable_team_plugin_upload === false) {
    return Promise.reject('Team plugin upload is disabled');
  }

  const {
    body: { toolIds, teamTagIds }
  } = parseApiInput({
    req,
    bodySchema: ConfirmTeamUploadPkgPluginBodySchema
  });

  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    per: TeamPluginManagePermissionVal
  });

  await confirmPluginToSource(toolIds, teamId);
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
        teamTagIds,
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
