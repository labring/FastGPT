import { NextAPI } from '@/service/middleware/entry';
import {
  DeleteTeamToolBodySchema,
  type DeleteTeamToolBodyType
} from '@fastgpt/global/openapi/core/plugin/team/tool/api';
import {
  TeamPluginEmptyResponseSchema,
  type TeamPluginEmptyResponseType
} from '@fastgpt/global/openapi/core/plugin/team/common';
import { TeamPluginRegistrySourceEnum } from '@fastgpt/global/core/plugin/schema/type';
import { TeamPluginManagePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  getRawPluginIdFromSystemToolId,
  getTeamPluginPolicy,
  setTeamPluginDeleted
} from '@fastgpt/service/core/plugin/teamPluginPolicy';
import { deletePluginFromSource } from '@fastgpt/service/thirdProvider/fastgptPlugin';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type { ApiRequestProps } from '@fastgpt/next/type';

export type DeleteTeamToolBody = DeleteTeamToolBodyType;
export type DeleteTeamToolResponse = TeamPluginEmptyResponseType;

async function handler(req: ApiRequestProps<DeleteTeamToolBody>): Promise<DeleteTeamToolResponse> {
  const {
    body: { pluginId, version }
  } = parseApiInput({
    req,
    bodySchema: DeleteTeamToolBodySchema
  });

  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    per: TeamPluginManagePermissionVal
  });
  const rawPluginId = getRawPluginIdFromSystemToolId(pluginId);
  const policy = await getTeamPluginPolicy({
    teamId,
    pluginId: rawPluginId,
    registrySource: TeamPluginRegistrySourceEnum.team
  });
  const targetVersion = version ?? policy?.version;

  if (targetVersion) {
    await deletePluginFromSource({
      pluginId: rawPluginId,
      source: teamId,
      version: targetVersion
    }).catch((error) => {
      const errorText = typeof error === 'string' ? error : JSON.stringify(error);
      if (!/not\s*found|404/i.test(errorText)) {
        return Promise.reject(error);
      }
    });
  }

  await setTeamPluginDeleted({
    teamId,
    tmbId,
    pluginId: rawPluginId
  });

  return TeamPluginEmptyResponseSchema.parse(undefined);
}

export default NextAPI(handler);
