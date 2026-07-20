import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getUserAccessibleModels } from '@fastgpt/service/support/permission/model/controller';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { addDays } from 'date-fns';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import {
  UsageLogBodySchema,
  UsageLogResponseSchema,
  type UsageLogBody,
  type UsageLogItem,
  type UsageLogPaginationResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { MongoUsageItem } from '@fastgpt/service/support/wallet/usage/usageItemSchema';
import { MongoUsage } from '@fastgpt/service/support/wallet/usage/schema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import type { SourceMemberType } from '@fastgpt/global/support/user/type';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';

/**
 * Model-dimension call log (design §14.1). Lists usage_items restricted to the
 * models the current user can access:
 * - modelId records must reference an accessible model (AUTH-TC08);
 * - legacy records without modelId match the upstream model name of an
 *   accessible model (conservative: anything else is excluded);
 * - `search` matches the creator username (join usage_items -> usages -> tmb);
 * - display name/type are resolved server-side from the accessible model set,
 *   falling back to the stored `model` name when the model is gone.
 */
async function handler(
  req: ApiRequestProps<UsageLogBody, UsageLogBody>,
  _res: ApiResponseType<any>
): Promise<UsageLogPaginationResponse> {
  const body = parseApiInput({ req, bodySchema: UsageLogBodySchema }).body;
  const { modelId, type, search } = body;
  const dateStart = body.dateStart ? new Date(body.dateStart) : addDays(new Date(), -7);
  const dateEnd = body.dateEnd ? new Date(body.dateEnd) : new Date();
  const pageSize = body.pageSize ? Number(body.pageSize) : 20;
  const pageNum = body.pageNum ? Number(body.pageNum) : 1;
  const offset = body.offset !== undefined ? Number(body.offset) : (pageNum - 1) * pageSize;

  const { teamId, tmbId, tmb } = await authUserPer({
    req,
    authToken: true,
    per: ReadPermissionVal
  });

  // Visibility boundary: only usage of accessible models is returned
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
    // Records referencing an inaccessible modelId are excluded; legacy records
    // without modelId fall back to the upstream model name (conservative).
    $or: [
      { modelId: { $in: [...accessibleById.keys()] } },
      { modelId: { $exists: false }, model: { $in: accessibleNames } }
    ]
  };

  // Narrow to one selected model (id + legacy name fallback)
  if (modelId) {
    const selected = accessibleById.get(modelId);
    // A non-visible model id must not leak any record (AUTH-TC08)
    if (!selected) {
      return UsageLogResponseSchema.parse({ list: [], total: 0, pageNum, pageSize });
    }
    where.$or = [{ modelId }, { modelId: { $exists: false }, model: selected.model }];
  }

  // Creator keyword -> usageIds. usage_items carry no tmbId, so join through
  // the parent usage record (usages.tmbId -> teamMember -> user.username).
  if (search) {
    const users = await MongoUser.find(
      { username: new RegExp(replaceRegChars(search), 'i') },
      '_id'
    ).lean();
    const tmbIds = users.length
      ? await MongoTeamMember.find({ userId: { $in: users.map((u) => u._id) } }, '_id').lean()
      : [];
    if (tmbIds.length === 0) {
      return UsageLogResponseSchema.parse({ list: [], total: 0, pageNum, pageSize });
    }
    const usageIds = await MongoUsage.find(
      { tmbId: { $in: tmbIds.map((t) => t._id) } },
      '_id'
    ).lean();
    if (usageIds.length === 0) {
      return UsageLogResponseSchema.parse({ list: [], total: 0, pageNum, pageSize });
    }
    where.usageId = { $in: usageIds.map((u) => u._id) };
  }

  const [items, total] = await Promise.all([
    MongoUsageItem.find(where, undefined, { ...readFromSecondary })
      .sort({ _id: -1 })
      .skip(offset)
      .limit(pageSize)
      .lean(),
    MongoUsageItem.countDocuments(where, { ...readFromSecondary })
  ]);

  // Resolve creators for the page (one batch tmb lookup via addSourceMember —
  // same convention as the model list / dataset list). usages carry no
  // sourceMember when the member is missing; the rows themselves are kept.
  const usageIds = items.map((item) => String(item.usageId)).filter(Boolean);
  const usages = usageIds.length
    ? await MongoUsage.find({ _id: { $in: usageIds } }, 'tmbId').lean()
    : [];
  const usageIdToSourceMember = new Map<string, SourceMemberType>();
  if (usages.length > 0) {
    // Map the lean docs to plain { _id, tmbId } strings so the batch lookup
    // stays typed without casting (the schema's tmbId is an ObjectId).
    const withMember = await addSourceMember({
      list: usages.map((u) => ({ _id: String(u._id), tmbId: String(u.tmbId) }))
    });
    withMember.forEach((u) => usageIdToSourceMember.set(u._id, u.sourceMember));
  }

  const list: UsageLogItem[] = items.map((item) => {
    // Resolve display name/type from the accessible model set (id first, then
    // legacy model-name match); fall back to the stored upstream name.
    const byId = item.modelId ? accessibleById.get(String(item.modelId)) : undefined;
    const byName = !byId && item.model ? models.find((m) => m.model === item.model) : undefined;
    const modelData = byId || byName;

    return {
      id: String(item._id),
      time: new Date(item.time).toISOString(),
      modelId: item.modelId,
      model: item.model,
      name: modelData?.name ?? item.model,
      type: modelData?.type as UsageLogItem['type'],
      totalPoints: item.amount ?? 0,
      inputTokens: item.inputTokens,
      outputTokens: item.outputTokens,
      sourceMember: usageIdToSourceMember.get(String(item.usageId))
    };
  });

  return UsageLogResponseSchema.parse({
    list,
    total,
    pageNum,
    pageSize
  });
}

export default NextAPI(handler);
