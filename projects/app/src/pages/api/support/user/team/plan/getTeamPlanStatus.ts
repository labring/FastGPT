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
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<any>
): Promise<ClientTeamPlanStatusType | undefined> {
  try {
    const { teamId } = await authCert({
      req,
      authToken: true
    });

    const [planStatus, usedMember, usedAppAmount, usedDatasetSize, usedDatasetIndexSize] =
      await Promise.all([
        getTeamPlanStatus({
          teamId
        }),
        MongoTeamMember.countDocuments({
          teamId,
          status: { $ne: TeamMemberStatusEnum.leave }
        }),
        MongoApp.countDocuments({
          teamId,
          type: {
            $in: [AppTypeEnum.simple, AppTypeEnum.workflow, AppTypeEnum.plugin, AppTypeEnum.tool]
          }
        }),
        MongoDataset.countDocuments({
          teamId,
          type: { $ne: DatasetTypeEnum.folder }
        }),
        getVectorCountByTeamId(teamId)
      ]);

    return {
      ...planStatus,
      usedMember,
      usedAppAmount,
      usedDatasetSize,
      usedDatasetIndexSize
    };
  } catch (error) {}
}

export default NextAPI(handler);
