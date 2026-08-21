import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import {
  NullRoleVal,
  PerResourceTypeEnum,
  ReadPermissionVal,
  ReadRoleVal
} from '@fastgpt/global/support/permission/constant';
import { getUserAccessibleModels } from '@fastgpt/service/support/permission/model/controller';
import { checkModelAccessThroughResource } from '@fastgpt/service/support/permission/model/auth';
import { ModelPermission } from '@fastgpt/global/support/permission/model/controller';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { extractWorkflowModelIds } from '@fastgpt/global/core/workflow/utils';
import { sumPer } from '@fastgpt/global/support/permission/utils';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgIdSetWithParentByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  ListModelsBodySchema,
  ListModelsResponseSchema,
  type ListModelsBody,
  type ListModelsPaginationResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import type { SystemModelItemType } from '@fastgpt/service/core/ai/model/type';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import type { SourceMemberType } from '@fastgpt/global/support/user/type';
import {
  channelCount,
  getModelChannelsMapByModels,
  type ChannelBrief
} from '@fastgpt/service/core/ai/channel';

/**
 * 分页获取当前用户可访问的模型列表（设计 §7.1）。
 *
 * 可见性规则由 getUserAccessibleModels 统一处理：
 * - 系统模型全平台可见（含已停用）
 * - 自己创建的私有模型始终可见
 * - 同团队模型：仅当权限条目存在且用户在协作者列表时可见
 * - 其他团队模型不可见
 *
 * 注意：getUserAccessibleModels 对 isSystem 模型不加 isActive 过滤，因此模型选择器
 * （picker）必须始终传 isActive='active'，否则会展示已停用的系统模型。
 *
 * POST-only per design §7.1: filters are parsed from the request body.
 */
async function handler(
  req: ApiRequestProps<ListModelsBody, ListModelsBody>,
  _res: ApiResponseType<ListModelsPaginationResponse>
): Promise<ListModelsPaginationResponse> {
  const body = parseApiInput({ req, bodySchema: ListModelsBodySchema }).body;
  const { provider, type, search, isActive, isSystem, pageSize, pageNum, offset, resourceContext } =
    body;

  const { teamId, tmbId, tmb, isRoot } = await authUserPer({
    req,
    authToken: true,
    per: ReadPermissionVal
  });

  // 获取用户可访问的模型（自己的 + 系统模型 + 团队授权）
  let models = await getUserAccessibleModels({
    teamId,
    tmbId,
    tmbPer: tmb.permission
  });

  if (resourceContext?.appId || resourceContext?.datasetId) {
    const linkedResourceContext = resourceContext.appId
      ? { appId: resourceContext.appId }
      : { datasetId: resourceContext.datasetId as string };
    const resourceModelIds = await (async () => {
      if (resourceContext.appId) {
        const app = await MongoApp.findById(resourceContext.appId, 'modules chatConfig').lean();
        return app
          ? extractWorkflowModelIds({ modules: app.modules, chatConfig: app.chatConfig })
          : [];
      }
      if (resourceContext.datasetId) {
        const dataset = await MongoDataset.findById(
          resourceContext.datasetId,
          'vectorModelId agentModelId vlmModelId'
        ).lean();
        return dataset
          ? [dataset.vectorModelId, dataset.agentModelId, dataset.vlmModelId].filter(
              (id): id is string => !!id
            )
          : [];
      }
      return [];
    })();
    const visibleIds = new Set(models.map((model) => model.id));
    const linkedModels = await Promise.all(
      resourceModelIds
        .filter((id) => !visibleIds.has(id))
        .map(async (modelId) => {
          const model = global.systemModelIdMap.get(modelId);
          if (
            !model ||
            !(await checkModelAccessThroughResource({
              modelId,
              teamId,
              tmbId,
              isRoot,
              resourceContext: linkedResourceContext
            }))
          ) {
            return undefined;
          }
          return model;
        })
    );
    models = [...models, ...(linkedModels.filter(Boolean) as SystemModelItemType[])];
  }

  // 按 provider/type/search/isActive/isSystem 过滤
  if (provider) models = models.filter((m) => m.provider === provider);
  if (type) models = models.filter((m) => m.type === type);
  if (isSystem !== undefined) models = models.filter((m) => m.isSystem === isSystem);
  if (search) {
    const s = search.toLowerCase();
    // 创建人搜索（设计 §13.2 团队 Tab / F2-S5-TC04、F3-S5-TC03）：先一次性解析
    // 全部私有模型的创建人（仅当有关键词时才查，一次批量查询），过滤在分页前
    // 执行，分页计数不受影响。系统模型无创建人，不参与创建人匹配。
    const creatorMemberMap = await buildSourceMemberMap(models);
    models = models.filter((m) => {
      const creatorName = m.isSystem || !m.tmbId ? undefined : creatorMemberMap.get(m.id)?.name;
      return (
        m.id?.toLowerCase().includes(s) ||
        m.name?.toLowerCase().includes(s) ||
        m.model.toLowerCase().includes(s) ||
        creatorName?.toLowerCase().includes(s)
      );
    });
  }
  if (isActive === 'active') models = models.filter((m) => m.isActive);
  if (isActive === 'inactive') models = models.filter((m) => !m.isActive);

  // 排序：启用模型在前；同状态下当前成员自建模型（own）优先，再按 provider 字母序
  // （设计 §7.1 / F3-S5：可用模型页 own first —— 自有模型排在最前）
  models.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    const aOwn = !a.isSystem && String(a.tmbId) === tmbId;
    const bOwn = !b.isSystem && String(b.tmbId) === tmbId;
    if (aOwn !== bOwn) return aOwn ? -1 : 1;
    return (a.provider || '').localeCompare(b.provider || '');
  });

  const activeTotal = models.filter((m) => m.isActive).length;

  // 分页
  const total = models.length;
  const size = pageSize ? Number(pageSize) : total;
  const page = pageNum ? Number(pageNum) : 1;
  const start = offset !== undefined ? Number(offset) : (page - 1) * size;
  const pageModels = models.slice(start, start + size);

  // channelCount: each model is counted against its OWN bucket — system models
  // against system channels, private models against their owner's group channels
  // (design §2.9.2 — replaces the deprecated global.aiproxyChannelsCache 口径).
  // aiproxy is not on the critical path of the list: on failure fall back to an
  // empty map so the model list keeps working (channelCount shows 0).
  let channelMap = new Map<string, ChannelBrief[]>();
  try {
    channelMap = await getModelChannelsMapByModels(pageModels);
  } catch {
    channelMap = new Map();
  }

  // Creator resolution for the current page (design §13.2 team-tab creator column).
  // addSourceMember mirrors the dataset-list convention (one batch MongoTeamMember
  // lookup); system models and models whose member was deleted resolve to no
  // sourceMember (optional field).
  const sourceMemberMap = await buildSourceMemberMap(pageModels);

  // Current-user permission snapshot per model (design §13.2 action column).
  // One batched MongoResourcePermission query for the page (≤20 ids) — the
  // same sumPer pattern as the dataset list; never per-model queries.
  const permissionMap = await buildPagePermissionMap({
    pageModels,
    teamId,
    tmbId,
    isRoot
  });

  const list = pageModels.map((m) =>
    formatModelListItem(m, channelMap, sourceMemberMap, permissionMap)
  );

  return ListModelsResponseSchema.parse({
    list,
    total,
    pageNum: page,
    pageSize: size,
    activeTotal
  });
}

/**
 * Resolve creators for a set of models (one batch lookup via addSourceMember —
 * the dataset-list convention). Only private models carry a tmbId; system
 * models and models whose member was deleted resolve to no sourceMember.
 * Returns the map keyed by model id.
 */
const buildSourceMemberMap = async (
  models: SystemModelItemType[]
): Promise<Map<string, SourceMemberType>> => {
  const privateModels = models.filter(
    (m): m is SystemModelItemType & { tmbId: string } => !m.isSystem && !!m.tmbId
  );
  if (privateModels.length === 0) return new Map();
  const withMember = await addSourceMember({ list: privateModels });
  return new Map(withMember.map((m) => [m.id, m.sourceMember]));
};

/**
 * Build the current user's ModelPermission snapshot for one page of models.
 *
 * Mirrors getModelPermission (auth.ts) but batches the MongoResourcePermission
 * query for the whole page (≤20 ids, $in) instead of one query per model:
 * - root: full permissions (isOwner)
 * - system models: read-only for everyone else (design §13.2 / #65 decision:
 *   non-root users must not toggle/edit/delete system models)
 * - own private models: isOwner + full permissions
 * - other models: summed collaborator roles (direct member row wins, then
 *   group/org rows via sumPer — same pattern as the dataset list)
 */
const buildPagePermissionMap = async ({
  pageModels,
  teamId,
  tmbId,
  isRoot
}: {
  pageModels: SystemModelItemType[];
  teamId: string;
  tmbId: string;
  isRoot: boolean;
}): Promise<Map<string, ModelPermission>> => {
  const allOwner = new ModelPermission({ isOwner: true });

  if (isRoot) {
    return new Map(pageModels.map((m) => [m.id, allOwner]));
  }

  const pageIds = pageModels.map((m) => m.id);
  const [rps, myGroupMap, myOrgSet] = await Promise.all([
    MongoResourcePermission.find({
      resourceType: PerResourceTypeEnum.model,
      teamId,
      resourceId: { $in: pageIds }
    }).lean(),
    getGroupsByTmbId({ tmbId, teamId }).then((groups) => {
      const map = new Map<string, 1>();
      groups.forEach((group) => map.set(String(group._id), 1));
      return map;
    }),
    getOrgIdSetWithParentByTmbId({
      teamId,
      tmbId
    })
  ]);

  // Rows that involve the current user (direct member row or via group/org)
  const myRoles = rps.filter(
    (item) =>
      String(item.tmbId) === String(tmbId) ||
      myGroupMap.has(String(item.groupId)) ||
      myOrgSet.has(String(item.orgId))
  );

  return new Map(
    pageModels.map((m) => {
      if (m.isSystem) {
        return [m.id, new ModelPermission({ role: ReadRoleVal })];
      }
      // Only the creator has full permissions — team owners get no owner rights
      // over other members' models (mirror getModelPermission, user ruling 2026-08).
      const isOwner = m.tmbId !== undefined && String(m.tmbId) === tmbId;
      if (isOwner) {
        return [m.id, allOwner];
      }
      const tmbRole = myRoles.find(
        (item) => String(item.resourceId) === m.id && !!item.tmbId
      )?.permission;
      const groupAndOrgRole = sumPer(
        ...myRoles
          .filter((item) => String(item.resourceId) === m.id && (!!item.groupId || !!item.orgId))
          .map((item) => item.permission)
      );
      return [m.id, new ModelPermission({ role: tmbRole ?? groupAndOrgRole ?? NullRoleVal })];
    })
  );
};

const formatModelListItem = (
  modelData: SystemModelItemType,
  channelMap: Map<string, ChannelBrief[]>,
  sourceMemberMap: Map<string, SourceMemberType>,
  permissionMap: Map<string, ModelPermission>
): ListModelsPaginationResponse['list'][number] => ({
  id: modelData.id,
  type: modelData.type,
  provider: modelData.provider,
  model: modelData.model,
  name: modelData.name,
  avatar: modelData.avatar,
  isActive: modelData.isActive ?? false,
  isSystem: modelData.isSystem ?? false,
  testMode: modelData.testMode,
  charsPointsPrice: modelData.charsPointsPrice,
  priceTiers: modelData.priceTiers,
  // Tag
  contextToken:
    'maxContext' in modelData
      ? (modelData as { maxContext?: number }).maxContext
      : 'maxToken' in modelData
        ? (modelData as { maxToken?: number }).maxToken
        : undefined,
  quoteMaxToken: (modelData as { quoteMaxToken?: number }).quoteMaxToken,
  hidden: (modelData as { hidden?: boolean }).hidden,
  vision: (modelData as { vision?: boolean }).vision,
  audio: (modelData as { audio?: boolean }).audio,
  video: (modelData as { video?: boolean }).video,
  reasoning: (modelData as { reasoning?: boolean }).reasoning,
  toolChoice: (modelData as { toolChoice?: boolean }).toolChoice,
  channelCount: channelCount(modelData.id, channelMap),
  sourceMember: sourceMemberMap.get(modelData.id),
  permission: permissionMap.get(modelData.id) ?? new ModelPermission()
});

export default NextAPI(handler);
