import type { NextApiRequest, NextApiResponse } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getTeamPlanStatus } from '@fastgpt/service/support/wallet/sub/utils';
import { getTeamCanHideShareBrand } from '@fastgpt/service/support/wallet/sub/service';
import { NextAPI } from '@/service/middleware/entry';
import type { ClientTeamPlanStatusType } from '@fastgpt/global/support/wallet/sub/type';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppTypeList } from '@fastgpt/global/core/app/constants';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { getVectorCountByTeamId } from '@fastgpt/service/common/vectorDB/controller';
import { countEffectiveTeamMembers } from '@fastgpt/service/support/user/team/controller';
import { MongoAppRegistration } from '@fastgpt/service/support/appRegistration/schema';
import {
  GetTeamPlanStatusQuerySchema,
  GetTeamPlanStatusResponseSchema,
  GetTeamPlanEntitlementsResponseSchema,
  type GetTeamPlanStatusApiResponse
} from '@fastgpt/global/openapi/support/user/team/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(
  req: NextApiRequest,
  _res: NextApiResponse<any>
): Promise<GetTeamPlanStatusApiResponse> {
  const { scope } = parseApiInput({ req, querySchema: GetTeamPlanStatusQuerySchema }).query;

  // 权益模式只读当前团队套餐，资源统计故障不应影响权限判断。
  if (scope === 'entitlements') {
    const { teamId } = await authCert({ req, authToken: true, allowAccountCancellation: true });
    return GetTeamPlanEntitlementsResponseSchema.parse({
      scope,
      canHideShareBrand: await getTeamCanHideShareBrand(teamId)
    });
  }

  const planStatusResult: ClientTeamPlanStatusType | undefined = await (async () => {
    try {
      const { teamId } = await authCert({
        req,
        authToken: true,
        allowAccountCancellation: true
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
        countEffectiveTeamMembers(teamId),
        MongoApp.countDocuments({
          teamId,
          type: {
            $in: AppTypeList
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
    } catch (error) {}
  })();

  return GetTeamPlanStatusResponseSchema.parse(planStatusResult);
}

export default NextAPI(handler);
