import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { TeamEvaluationCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { EvalMetricTypeEnum } from '@fastgpt/global/core/evaluation/metric/constants';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { Types } from '@fastgpt/service/common/mongo';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import { EvaluationPermission } from '@fastgpt/global/support/permission/evaluation/controller';
import { sumPer } from '@fastgpt/global/support/permission/utils';
import type { ListMetricsBody } from '@fastgpt/global/core/evaluation/metric/api';
import { addLog } from '@fastgpt/service/common/system/log';
import { getEvaluationPermissionAggregation } from '@fastgpt/service/core/evaluation/common';

async function handler(req: ApiRequestProps<ListMetricsBody, {}>) {
  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: TeamEvaluationCreatePermissionVal
  });

  const { offset, pageSize } = parsePaginationRequest(req);
  const { searchKey } = req.body;

  const match: Record<string, any> = {
    teamId: new Types.ObjectId(teamId)
  };

  if (searchKey && typeof searchKey === 'string' && searchKey.trim().length > 0) {
    match.name = { $regex: new RegExp(`${replaceRegChars(searchKey.trim())}`, 'i') };
  }

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
    if (searchKey) {
      filter.$or = [
        { name: { $regex: searchKey, $options: 'i' } },
        { description: { $regex: searchKey, $options: 'i' } }
      ];
    }
    const limit = pageSize;
    const sort = { createTime: -1 as const };

    // Build query to include both accessible metrics and builtin metrics
    let finalFilter = filter;
    if (!isOwner) {
      finalFilter = {
        ...filter,
        $or: [
          { _id: { $in: accessibleIds.map((id) => new Types.ObjectId(id)) } },
          ...(tmbId ? [{ tmbId: new Types.ObjectId(tmbId) }] : []), // Own metrics
          { type: EvalMetricTypeEnum.Builtin } // Builtin metrics for all evaluation users
        ]
      };
    } else {
      // Owner用户也需要包含内置metrics（跨team访问）
      finalFilter = {
        $or: [
          filter, // 当前team的metrics
          { type: EvalMetricTypeEnum.Builtin } // 内置metrics（跨team）
        ]
      };
    }

    const [metrics, total] = await Promise.all([
      MongoEvalMetric.find(finalFilter).sort(sort).skip(offset).limit(limit).lean(),
      MongoEvalMetric.countDocuments(finalFilter)
    ]);

    const formatMetrics = metrics
      .map((metric: any) => {
        const getPer = (metricId: string) => {
          // 内置metric特殊处理：允许有evaluation权限的用户访问
          if (metric.type === EvalMetricTypeEnum.Builtin) {
            return new EvaluationPermission({ role: ReadPermissionVal, isOwner: false });
          }

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

    const formattedResult = await addSourceMember({
      list: formatMetrics
    });

    const finalResult = {
      list: formattedResult,
      total: total
    };

    addLog.info('[Evaluation Metric] Metric list query successful', {
      pageSize: pageSize,
      searchKey: searchKey?.trim(),
      total: finalResult.total,
      returned: finalResult.list.length
    });

    return finalResult;
  } catch (error) {
    addLog.error('[Evaluation Metric] Failed to fetch evaluation metrics', error);
    return Promise.reject(error);
  }
}

export default NextAPI(handler);

export { handler };
