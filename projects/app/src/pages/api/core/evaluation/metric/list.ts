import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { TeamEvaluationCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import { EvaluationPermission } from '@fastgpt/global/support/permission/evaluation/controller';
import { sumPer } from '@fastgpt/global/support/permission/utils';
import { addLog } from '@fastgpt/service/common/system/log';
import { getEvaluationPermissionAggregation } from '@fastgpt/service/core/evaluation/common';
import { getBuiltinMetrics } from '@fastgpt/service/core/evaluation/metric/provider';

async function handler(req: ApiRequestProps<{}, {}>) {
  await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: TeamEvaluationCreatePermissionVal
  });

  try {
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

    const filter: any = { teamId: new Types.ObjectId(teamId) };

    // If not owner, filter by accessible resources
    let finalFilter = filter;
    if (!isOwner && accessibleIds.length > 0) {
      finalFilter = {
        ...filter,
        $or: [
          { _id: { $in: accessibleIds.map((id) => new Types.ObjectId(id)) } },
          ...(tmbId ? [{ tmbId: new Types.ObjectId(tmbId) }] : []) // Own metrics
        ]
      };
    }

    const customMetrics = await MongoEvalMetric.find(finalFilter).sort({ createTime: -1 }).lean();

    const formatCustomMetrics = customMetrics
      .map((metric: any) => {
        const getPer = (metricId: string) => {
          const tmbRole = myRoles.find(
            (item) => String(item.resourceId) === metricId && !!item.tmbId
          )?.permission;
          const groupRole = sumPer(
            ...myRoles
              .filter(
                (item) => String(item.resourceId) === metricId && (!!item.groupId || !!item.orgId)
              )
              .map((item) => item.permission)
          );
          return new EvaluationPermission({
            role: tmbRole ?? groupRole,
            isOwner: String(metric.tmbId) === String(tmbId) || isOwner
          });
        };

        const getClbCount = (metricId: string) => {
          return roleList.filter((item) => String(item.resourceId) === String(metricId)).length;
        };

        const getPrivateStatus = (metricId: string) => {
          const collaboratorCount = getClbCount(metricId);
          if (isOwner) {
            return collaboratorCount <= 1;
          }
          return (
            collaboratorCount === 0 ||
            (collaboratorCount === 1 && String(metric.tmbId) === String(tmbId))
          );
        };

        return {
          ...metric,
          permission: getPer(String(metric._id)),
          private: getPrivateStatus(String(metric._id))
        };
      })
      .filter((metric: any) => metric.permission.hasReadPer);

    // Add source member only for custom metrics
    const customWithSourceMember = await addSourceMember({
      list: formatCustomMetrics
    });

    // Get builtin metrics
    const builtinMetrics = await getBuiltinMetrics();
    const formatBuiltinMetrics = builtinMetrics.map((metric: any) => ({
      ...metric
    }));

    // Combine results
    const finalList = [...customWithSourceMember, ...formatBuiltinMetrics];

    addLog.info('[Evaluation Metric] Metric list query successful', {
      total: finalList.length,
      builtin: formatBuiltinMetrics.length,
      custom: customWithSourceMember.length
    });

    return {
      list: finalList
    };
  } catch (error) {
    addLog.error('[Evaluation Metric] Failed to fetch evaluation metrics', error);
    return Promise.reject(error);
  }
}

export default NextAPI(handler);

export { handler };
