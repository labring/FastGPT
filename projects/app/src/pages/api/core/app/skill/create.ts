import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { TeamAppCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { checkTeamAppTypeLimit } from '@fastgpt/service/support/permission/teamLimit';
import { onCreateApp } from '../create';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getSkillTemplateById } from '@fastgpt/global/core/app/skill/constants';
import {
  CreateSkillAppBodySchema,
  CreateSkillAppResponseSchema,
  type CreateSkillAppBodyType,
  type CreateSkillAppResponseType
} from '@fastgpt/global/openapi/core/app/skill/api';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { skillManifest2AppConfig } from '@fastgpt/global/core/app/skill/utils';

async function handler(
  req: ApiRequestProps<CreateSkillAppBodyType>
): Promise<CreateSkillAppResponseType> {
  const {
    parentId,
    skillId,
    name,
    avatar,
    intro,
    variables,
    toolIds,
    datasetIds
  } = CreateSkillAppBodySchema.parse(req.body);

  const { teamId, tmbId } = parentId
    ? await authApp({ req, appId: parentId, per: WritePermissionVal, authToken: true })
    : await authUserPer({ req, authToken: true, per: TeamAppCreatePermissionVal });

  await checkTeamAppTypeLimit({ teamId, appCheckType: 'app' });

  const skill = getSkillTemplateById(skillId);
  if (!skill) {
    return Promise.reject('Skill template not found');
  }

  const appConfig = skillManifest2AppConfig({
    manifest: skill,
    variableValues: variables,
    customName: name,
    customAvatar: avatar,
    customIntro: intro,
    selectedToolIds: toolIds,
    selectedDatasetIds: datasetIds
  });

  const appId = await onCreateApp({
    parentId,
    name: appConfig.name,
    avatar: appConfig.avatar,
    intro: appConfig.intro,
    type: AppTypeEnum.skill,
    modules: appConfig.modules,
    edges: appConfig.edges,
    chatConfig: appConfig.chatConfig,
    teamId,
    tmbId
  });

  return CreateSkillAppResponseSchema.parse(appId);
}

export default NextAPI(handler);
