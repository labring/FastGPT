import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getUserAccessibleModels } from '@fastgpt/service/support/permission/model/controller';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { addDays } from 'date-fns';
import {
  UsageStatsBodySchema,
  type UsageStatsBody,
  type UsageStatsResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { MongoUsageItem } from '@fastgpt/service/support/wallet/usage/usageItemSchema';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';

/**
 * Model monitor aggregates (design §14.2) over usage_items, restricted to the
 * models the current user can access (AUTH-TC08):
 * - totals: calls / tokens / points for the whole range;
 * - trend: per-day buckets (timezone-aware $dateToString, like the pro
 *   getDashboardData aggregation);
 * - modelDistribution: per-model points/calls, resolved names server-side.
 *
 * Latency/success metrics are intentionally omitted: usage_items carry no
 * latency/error data, so the monitor reports calls/tokens/points only.
 */
async function handler(
  req: ApiRequestProps<UsageStatsBody, UsageStatsBody>,
  _res: ApiResponseType<any>
): Promise<UsageStatsResponse> {
  const body = parseApiInput({ req, bodySchema: UsageStatsBodySchema }).body;
  const { modelId, type, timezone = '+00:00' } = body;
  const dateStart = body.dateStart ? new Date(body.dateStart) : addDays(new Date(), -7);
  const dateEnd = body.dateEnd ? new Date(body.dateEnd) : new Date();

  const { teamId, tmbId, tmb } = await authUserPer({
    req,
    authToken: true,
    per: ReadPermissionVal
  });

  let models = await getUserAccessibleModels({
    teamId,
    tmbId,
    tmbPer: tmb.permission
  });
  if (type) models = models.filter((m) => m.type === type);

  const accessibleById = new Map(models.map((m) => [m.id, m]));
  const accessibleNames = models.map((m) => m.model);

  const where: Record<string, any> = {
    time: { $gte: dateStart, $lte: dateEnd },
    // Same model-level visibility boundary as the call log (AUTH-TC08)
    $or: [
      { modelId: { $in: [...accessibleById.keys()] } },
      { modelId: { $exists: false }, model: { $in: accessibleNames } }
    ]
  };

  if (modelId) {
    const selected = accessibleById.get(modelId);
    if (!selected) {
      return {
        totalCalls: 0,
        totalTokens: 0,
        totalPoints: 0,
        trend: [],
        modelDistribution: []
      };
    }
    where.$or = [{ modelId }, { modelId: { $exists: false }, model: selected.model }];
  }

  // Item tokens: sum input+output; records missing both token fields fall back
  // to the legacy `tokens` field (or 0 when neither exists).
  const tokensExpr = {
    $cond: {
      if: {
        $and: [
          { $eq: [{ $ifNull: ['$inputTokens', null] }, null] },
          { $eq: [{ $ifNull: ['$outputTokens', null] }, null] }
        ]
      },
      then: { $ifNull: ['$tokens', 0] },
      else: { $add: [{ $ifNull: ['$inputTokens', 0] }, { $ifNull: ['$outputTokens', 0] }] }
    }
  };

  const [aggregated] = (await MongoUsageItem.aggregate(
    [
      { $match: where },
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                calls: { $sum: 1 },
                tokens: { $sum: tokensExpr },
                points: { $sum: { $ifNull: ['$amount', 0] } }
              }
            }
          ],
          trend: [
            {
              $group: {
                _id: {
                  $dateToString: { format: '%Y-%m-%d', date: '$time', timezone }
                },
                calls: { $sum: 1 },
                tokens: { $sum: tokensExpr },
                points: { $sum: { $ifNull: ['$amount', 0] } }
              }
            },
            { $sort: { _id: 1 } },
            { $project: { _id: 0, date: '$_id', calls: 1, tokens: 1, points: 1 } }
          ],
          distribution: [
            {
              // Legacy records without modelId group by their upstream model name
              $group: {
                _id: { $ifNull: ['$modelId', '$model'] },
                calls: { $sum: 1 },
                points: { $sum: { $ifNull: ['$amount', 0] } }
              }
            },
            { $sort: { points: -1 } },
            { $limit: 100 }
          ]
        }
      }
    ],
    {
      ...readFromSecondary
    }
  )) as any[];

  const totals = aggregated?.totals?.[0] ?? {};

  // Resolve distribution display names from the accessible model set
  const modelDistribution = (aggregated?.distribution ?? []).map((item: any) => {
    const key = String(item._id);
    const byId = accessibleById.get(key);
    const byName = !byId ? models.find((m) => m.model === key) : undefined;
    return {
      modelId: key,
      name: byId?.name ?? byName?.name ?? key,
      calls: item.calls ?? 0,
      points: item.points ?? 0
    };
  });

  return {
    totalCalls: totals.calls ?? 0,
    totalTokens: totals.tokens ?? 0,
    totalPoints: totals.points ?? 0,
    trend: (aggregated?.trend ?? []).map((item: any) => ({
      date: item.date,
      calls: item.calls ?? 0,
      tokens: item.tokens ?? 0,
      points: item.points ?? 0
    })),
    modelDistribution
  };
}

export default NextAPI(handler);
