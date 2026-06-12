import { NextAPI } from '@/service/middleware/entry';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoAgentSkills } from '@fastgpt/service/core/ai/skill/model/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/ai/skill/constants';
import { getSubtreeMaxFolderDepth } from '@fastgpt/service/common/parentFolder/depth';
import {
  GetSubtreeMaxFolderDepthQuerySchema,
  GetSubtreeMaxFolderDepthResponseSchema,
  type GetSubtreeMaxFolderDepthResponseType
} from '@fastgpt/global/common/parentFolder/depth';
import type { ApiRequestProps } from '@fastgpt/service/type/next';

async function handler(
  req: ApiRequestProps<unknown, unknown>
): Promise<GetSubtreeMaxFolderDepthResponseType> {
  const {
    query: { resourceType, resourceId }
  } = parseApiInput({
    req,
    querySchema: GetSubtreeMaxFolderDepthQuerySchema
  });

  if (resourceType === 'app') {
    const { app } = await authApp({
      req,
      authToken: true,
      appId: resourceId,
      per: ReadPermissionVal
    });
    const isFolderType =
      app.type === AppTypeEnum.toolFolder
        ? (type: string) => type === AppTypeEnum.toolFolder
        : app.type === AppTypeEnum.folder
          ? (type: string) => type === AppTypeEnum.folder
          : () => false;

    const subtreeMaxFolderDepth = await getSubtreeMaxFolderDepth({
      resourceId,
      teamId: String(app.teamId),
      model: MongoApp,
      isFolderType
    });

    return GetSubtreeMaxFolderDepthResponseSchema.parse({ subtreeMaxFolderDepth });
  }

  if (resourceType === 'dataset') {
    const { dataset } = await authDataset({
      req,
      authToken: true,
      datasetId: resourceId,
      per: ReadPermissionVal
    });

    const subtreeMaxFolderDepth = await getSubtreeMaxFolderDepth({
      resourceId,
      teamId: String(dataset.teamId),
      model: MongoDataset,
      isFolderType: (type) => type === DatasetTypeEnum.folder
    });

    return GetSubtreeMaxFolderDepthResponseSchema.parse({ subtreeMaxFolderDepth });
  }

  const { skill } = await authSkill({
    req,
    authToken: true,
    skillId: resourceId,
    per: ReadPermissionVal
  });

  const subtreeMaxFolderDepth = await getSubtreeMaxFolderDepth({
    resourceId,
    teamId: String(skill.teamId),
    model: MongoAgentSkills,
    isFolderType: (type) => type === AgentSkillTypeEnum.folder
  });

  return GetSubtreeMaxFolderDepthResponseSchema.parse({ subtreeMaxFolderDepth });
}

export default NextAPI(handler);
