import type { NextApiRequest, NextApiResponse } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getTeamPlanStatus } from '@fastgpt/service/support/wallet/sub/utils';
import { NextAPI } from '@/service/middleware/entry';
import type { ClientTeamPlanStatusType } from '@fastgpt/global/support/wallet/sub/type';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { getVectorCountByTeamId } from '@fastgpt/service/common/vectorDB/controller';
import { teamRepository } from '@fastgpt/service/common/dal';
import { MongoAppRegistration } from '@fastgpt/service/support/appRegistration/schema';
import {
  GetTeamPlanStatusQuerySchema,
  GetTeamPlanStatusResponseSchema,
  type GetTeamPlanStatusResponse
} from '@fastgpt/global/openapi/support/user/team/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(
  req: NextApiRequest,
  _res: NextApiResponse<any>
): Promise<GetTeamPlanStatusResponse> {
  parseApiInput({ req, querySchema: GetTeamPlanStatusQuerySchema });

  const planStatusResult: ClientTeamPlanStatusType | undefined = await (async () => {
    try {
      const { teamId } = await authCert({
        req,
        authToken: true
      });

      const [
        planStatus,
        usedMember,
        usedAppAmount,
        usedDatasetSize,
        usedDatasetIndexSize,
        usedRegistrationCount
      ] = await Promise.all([
        getTeamPlanStatus({
          teamId
        }),
        teamRepository.countMembersByTeamId(teamId, { includeLeft: false }),
        MongoApp.countDocuments({
          teamId,
          type: {
            $in: [AppTypeEnum.simple, AppTypeEnum.workflow]
          }
        }),
        MongoDataset.countDocuments({
          teamId,
          type: { $ne: DatasetTypeEnum.folder }
        }),
        getVectorCountByTeamId(teamId),
        MongoAppRegistration.countDocuments({
          teamId
        })
      ]);

      return {
        ...planStatus,
        usedMember,
        usedAppAmount,
        usedDatasetSize,
        usedDatasetIndexSize,
        usedRegistrationCount
      };
    } catch {}
  })();

  return GetTeamPlanStatusResponseSchema.parse(planStatusResult);
}

export default NextAPI(handler);
