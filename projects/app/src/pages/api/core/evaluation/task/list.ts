import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  ListEvaluationsRequest,
  ListEvaluationsResponse
} from '@fastgpt/global/core/evaluation/api';
import { EvaluationPermission } from '@fastgpt/global/support/permission/evaluation/controller';
import { sumPer } from '@fastgpt/global/support/permission/utils';
import { addSourceMember } from '@fastgpt/service/support/user/utils';

import { getEvaluationPermissionAggregation } from '@fastgpt/service/core/evaluation/common';

/*
  Get evaluation task list permissions - based on app list implementation
  1. Validate user permissions, get team permissions (owner handled separately)
  2. Get all evaluation task permissions under team, get all my groups, and calculate all my permissions
  3. Filter tasks I have permissions for, as well as tasks I created myself
  4. Get task list based on filter conditions
  5. Traverse searched tasks and assign permissions
  6. Filter again based on read permissions
*/
async function handler(
  req: ApiRequestProps<ListEvaluationsRequest>
): Promise<ListEvaluationsResponse> {
  try {
    const { pageNum = 1, pageSize = 20, searchKey } = req.body;

    const pageNumInt = Number(pageNum);
    const pageSizeInt = Number(pageSize);

    if (pageNumInt < 1) {
      return Promise.reject('Invalid page number');
    }

    if (pageSizeInt < 1 || pageSizeInt > 100) {
      return Promise.reject('Invalid page size (1-100)');
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
    const accessibleIds = myRoles.map((item) => item.resourceId);

    const result = await EvaluationTaskService.listEvaluations(
      teamId,
      pageNumInt,
      pageSizeInt,
      searchKey?.trim(),
      accessibleIds,
      tmbId,
      isOwner
    );

    const formatEvaluations = result.list
      .map((evaluation: any) => {
        const getPer = (evalId: string) => {
          const tmbRole = myRoles.find(
            (item) => String(item.resourceId) === evalId && !!item.tmbId
          )?.permission;
          const groupRole = sumPer(
            ...myRoles
              .filter(
                (item) => String(item.resourceId) === evalId && (!!item.groupId || !!item.orgId)
              )
              .map((item) => item.permission)
          );

          return new EvaluationPermission({
            role: tmbRole ?? groupRole,
            isOwner: String(evaluation.tmbId) === String(tmbId) || isOwner
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
            (collaboratorCount === 1 && String(evaluation.tmbId) === String(tmbId))
          );
        };

        return {
          ...evaluation,
          permission: getPer(String(evaluation._id)),
          private: getPrivateStatus(String(evaluation._id))
        };
      })
      .filter((evaluation: any) => evaluation.permission.hasReadPer);

    const formattedResult = await addSourceMember({
      list: formatEvaluations
    });

    const finalResult = {
      list: formattedResult,
      total: result.total
    };

    return finalResult;
  } catch (error) {
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
