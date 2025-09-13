import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type {
  EvaluationDetailRequest,
  EvaluationDetailResponse
} from '@fastgpt/global/core/evaluation/api';
import { EvaluationPermission } from '@fastgpt/global/support/permission/evaluation/controller';
import { sumPer } from '@fastgpt/global/support/permission/utils';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { getEvaluationPermissionAggregation } from '@fastgpt/service/core/evaluation/common';

async function handler(
  req: ApiRequestProps<{}, EvaluationDetailRequest>
): Promise<EvaluationDetailResponse> {
  const { evalId } = req.query;

  if (!evalId) {
    throw new Error(EvaluationErrEnum.evalIdRequired);
  }

  const { teamId, tmbId, isOwner, roleList, myGroupMap, myOrgSet } =
    await getEvaluationPermissionAggregation({
      req,
      authApiKey: true,
      authToken: true
    });

  const myRoles = roleList.filter(
    (item) =>
      String(item.tmbId) === String(tmbId) ||
      myGroupMap.has(String(item.groupId)) ||
      myOrgSet.has(String(item.orgId))
  );

  // Get evaluation details with app information
  const evaluationDetails = await EvaluationTaskService.getEvaluationDetail(evalId, teamId);

  const getPer = (evalId: string) => {
    const tmbRole = myRoles.find(
      (item) => String(item.resourceId) === evalId && !!item.tmbId
    )?.permission;
    const groupRole = sumPer(
      ...myRoles
        .filter((item) => String(item.resourceId) === evalId && (!!item.groupId || !!item.orgId))
        .map((item) => item.permission)
    );

    return new EvaluationPermission({
      role: tmbRole ?? groupRole,
      isOwner: String(evaluationDetails.tmbId) === String(tmbId) || isOwner
    });
  };

  const getClbCount = (evalId: string) => {
    return roleList.filter((item) => String(item.resourceId) === String(evalId)).length;
  };

  const getPrivateStatus = (evalId: string) => {
    const collaboratorCount = getClbCount(evalId);
    if (isOwner) {
      return collaboratorCount <= 1;
    }
    return (
      collaboratorCount === 0 ||
      (collaboratorCount === 1 && String(evaluationDetails.tmbId) === String(tmbId))
    );
  };

  const formattedEvaluation = {
    ...evaluationDetails,
    permission: getPer(String(evaluationDetails._id)),
    private: getPrivateStatus(String(evaluationDetails._id))
  };

  const result = await addSourceMember({
    list: [formattedEvaluation]
  });

  return result[0];
}

export default NextAPI(handler);
export { handler };
