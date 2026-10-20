import { NextAPI } from '@/service/middleware/entry';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import type { ReferencedAppsResponse } from '@fastgpt/global/core/app/type';
import {
  GetReferencedAppsQuerySchema,
  type GetReferencedAppsQuery
} from '@fastgpt/global/openapi/core/app/common/api';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { findAppAndAllChildren } from '@fastgpt/service/core/app/controller';
import { getAppPublishedResourceType } from '@fastgpt/service/core/app/resourceLookup';
import { findDatasetAndAllChildren } from '@fastgpt/service/core/dataset/controller';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { listReadableReferencedApps } from '@/service/core/app/referencedApps';

/**
 * List readable published apps referencing an owned resource or its descendants.
 * Target-resource access is owner-only; result visibility follows the requester's app permissions.
 */
async function handler(
  req: ApiRequestProps<unknown, GetReferencedAppsQuery>
): Promise<ReferencedAppsResponse> {
  const { resourceType, resourceId } = parseApiInput({
    req,
    querySchema: GetReferencedAppsQuerySchema
  }).query;
  const {
    teamId,
    tmbId,
    permission: teamPer
  } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });

  const resourceIds = await (async () => {
    if (resourceType === 'agent' || resourceType === 'tool') {
      const { permission: appPer } = await authApp({
        req,
        authToken: true,
        authApiKey: true,
        appId: resourceId,
        per: ReadPermissionVal
      });
      if (!appPer.isOwner) {
        throw AppErrEnum.unAuthApp;
      }

      const appsInTree = await findAppAndAllChildren({
        teamId,
        appId: resourceId,
        fields: '_id type deleteTime'
      });
      return appsInTree
        .filter((app) => !app.deleteTime && getAppPublishedResourceType(app.type) === resourceType)
        .map((app) => String(app._id));
    }

    if (resourceType === 'dataset') {
      const { permission: datasetPer } = await authDataset({
        req,
        authToken: true,
        authApiKey: true,
        datasetId: resourceId,
        per: ReadPermissionVal
      });
      if (!datasetPer.isOwner) {
        throw DatasetErrEnum.unAuthDataset;
      }

      const datasets = await findDatasetAndAllChildren({
        teamId,
        datasetId: resourceId,
        fields: '_id deleteTime'
      });
      return datasets
        .filter((dataset) => !dataset.deleteTime)
        .map((dataset) => String(dataset._id));
    }

    const { permission: skillPer } = await authSkill({
      req,
      authToken: true,
      authApiKey: true,
      skillId: resourceId,
      per: ReadPermissionVal
    });
    if (!skillPer.isOwner) {
      throw SkillErrEnum.unAuthSkill;
    }
    return [resourceId];
  })();

  return listReadableReferencedApps({
    teamId,
    tmbId,
    isTeamOwner: teamPer.isOwner,
    resourceType,
    resourceIds
  });
}

export default NextAPI(handler);
