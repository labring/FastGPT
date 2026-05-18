import type { NextApiResponse } from 'next';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types';
import type { SubPlanType } from '@fastgpt/global/support/wallet/sub/type';
import type { SystemDefaultModelType, SystemModelItemType } from '@fastgpt/service/core/ai/type';
import type { AIProxyChannelsType, I18nStringStrictType } from '@fastgpt/global/sdk/fastgpt-plugin';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import { MongoEmbeddingTrainTask } from '@fastgpt/service/core/train/embedding/task/schema';
import { MongoRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/schema';
import { resolveEmbeddingTasksByTunedModelId } from '@fastgpt/service/core/train/embedding/task/controller';
import { resolveRerankTasksByTunedModelId } from '@fastgpt/service/core/train/rerank/task/controller';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { Types } from '@fastgpt/service/common/mongo';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { getGroupsByTmbId } from '@fastgpt/service/support/permission/memberGroup/controllers';
import { getOrgsByTmbId } from '@fastgpt/service/support/permission/org/controllers';
import { getCollaboratorId } from '@fastgpt/global/support/permission/utils';

export type TrainTaskSummary = {
  totalCount: number;
  hasRunning: boolean;
  hasError: boolean;
  baseModelIds?: string[];
  latestTask?: {
    createTime: Date;
    creatorName: string;
    datasetIds: string[];
  };
};

export type ActiveModelListItem = SystemModelItemType & {
  trainTaskSummary: TrainTaskSummary;
};

export type InitDateResponse = {
  bufferId?: string;

  feConfigs?: FastGPTFeConfigsType;
  subPlans?: SubPlanType;
  systemVersion?: string;

  activeModelList?: ActiveModelListItem[];
  defaultModels?: SystemDefaultModelType;
  modelProviders?: { provider: string; value: I18nStringStrictType; avatar: string }[];
  aiproxyChannels?: AIProxyChannelsType;
};

const emptySummary = (): TrainTaskSummary => ({
  totalCount: 0,
  hasRunning: false,
  hasError: false
});

function computeSummaryFromTasks(
  tasks: {
    status: string;
    createTime: Date;
    tmbId?: string;
    datasetIds?: string[];
    baseModelId?: string;
  }[]
): TrainTaskSummary & { _tmbId?: string } {
  if (!tasks.length) return emptySummary();

  const sorted = [...tasks].sort(
    (a, b) => new Date(b.createTime).getTime() - new Date(a.createTime).getTime()
  );
  const latest = sorted[0];
  const baseModelIds = [
    ...new Set(tasks.map((t) => t.baseModelId).filter((id): id is string => !!id))
  ];

  return {
    totalCount: tasks.length,
    hasRunning: tasks.some((t) => t.status === 'running'),
    hasError: tasks.some((t) => t.status === 'failed'),
    baseModelIds: baseModelIds.length > 0 ? baseModelIds : undefined,
    latestTask: {
      createTime: latest.createTime,
      creatorName: '',
      datasetIds: latest.datasetIds || []
    },
    _tmbId: latest.tmbId
  };
}

async function batchQueryNonTunedSummaries(
  MongoModel: typeof MongoEmbeddingTrainTask | typeof MongoRerankTrainTask,
  teamId: string,
  baseModelIds: string[]
): Promise<Map<string, TrainTaskSummary & { _tmbId?: string }>> {
  if (!baseModelIds.length) return new Map();

  const result = await MongoModel.aggregate([
    {
      $match: {
        teamId: new Types.ObjectId(teamId),
        baseModelId: { $in: baseModelIds }
      }
    },
    { $sort: { createTime: -1 } },
    {
      $group: {
        _id: '$baseModelId',
        totalCount: { $sum: 1 },
        hasRunning: { $max: { $cond: [{ $eq: ['$status', 'running'] }, 1, 0] } },
        hasError: { $max: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        latestCreateTime: { $first: '$createTime' },
        latestTmbId: { $first: '$tmbId' },
        latestDatasetIds: { $first: '$datasetIds' }
      }
    },
    {
      $project: {
        _id: 0,
        baseModelId: '$_id',
        totalCount: 1,
        hasRunning: { $eq: ['$hasRunning', 1] },
        hasError: { $eq: ['$hasError', 1] },
        latestCreateTime: 1,
        latestTmbId: 1,
        latestDatasetIds: { $ifNull: ['$latestDatasetIds', []] }
      }
    }
  ]);

  const map = new Map<string, TrainTaskSummary & { _tmbId?: string }>();
  for (const item of result) {
    map.set(item.baseModelId, {
      totalCount: item.totalCount || 0,
      hasRunning: !!item.hasRunning,
      hasError: !!item.hasError,
      latestTask: {
        createTime: item.latestCreateTime,
        creatorName: '',
        datasetIds: item.latestDatasetIds
      },
      _tmbId: item.latestTmbId
    });
  }
  return map;
}

async function resolveCreatorNames(
  summaries: Map<string, TrainTaskSummary & { _tmbId?: string }>
): Promise<void> {
  const allTmbIds = Array.from(summaries.values())
    .map((s) => s._tmbId)
    .filter((id): id is string => !!id);

  const uniqueTmbIds = [...new Set(allTmbIds)];

  if (!uniqueTmbIds.length) return;

  const members = await MongoTeamMember.find(
    { _id: { $in: uniqueTmbIds.map((id) => new Types.ObjectId(id)) } },
    { name: 1 }
  ).lean();

  const nameMap = new Map<string, string>();
  for (const m of members) {
    nameMap.set(String(m._id), m.name);
  }

  for (const summary of summaries.values()) {
    if (summary.latestTask && summary._tmbId) {
      summary.latestTask.creatorName = nameMap.get(summary._tmbId) || '';
    }
    delete summary._tmbId;
  }
}

async function buildActiveModelList(
  models: SystemModelItemType[],
  teamId: string
): Promise<ActiveModelListItem[]> {
  // Separate models by type and tuned status
  const nonTunedEmbedding = models.filter((m) => m.type === ModelTypeEnum.embedding && !m.isTuned);
  const tunedEmbedding = models.filter((m) => m.type === ModelTypeEnum.embedding && m.isTuned);
  const nonTunedRerank = models.filter((m) => m.type === ModelTypeEnum.rerank && !m.isTuned);
  const tunedRerank = models.filter((m) => m.type === ModelTypeEnum.rerank && m.isTuned);

  const summaryMap = new Map<string, TrainTaskSummary & { _tmbId?: string }>();

  // Batch query non-tuned models (2 queries total)
  const [embeddingSummaries, rerankSummaries] = await Promise.all([
    batchQueryNonTunedSummaries(
      MongoEmbeddingTrainTask,
      teamId,
      nonTunedEmbedding.map((m) => m.id)
    ),
    batchQueryNonTunedSummaries(
      MongoRerankTrainTask,
      teamId,
      nonTunedRerank.map((m) => m.id)
    )
  ]);

  for (const [key, val] of embeddingSummaries) summaryMap.set(key, val);
  for (const [key, val] of rerankSummaries) summaryMap.set(key, val);

  // Individual queries for tuned models (rare, one per model)
  for (const model of tunedEmbedding) {
    const tasks = await resolveEmbeddingTasksByTunedModelId(model.id, teamId);
    summaryMap.set(model.id, computeSummaryFromTasks(tasks as any));
  }
  for (const model of tunedRerank) {
    const tasks = await resolveRerankTasksByTunedModelId(model.id, teamId);
    summaryMap.set(model.id, computeSummaryFromTasks(tasks as any));
  }

  // Batch resolve creator names (1 query)
  await resolveCreatorNames(summaryMap);

  // Build result list
  return models.map((model) => {
    if (model.type !== ModelTypeEnum.embedding && model.type !== ModelTypeEnum.rerank) {
      return { ...model, trainTaskSummary: emptySummary() };
    }
    const summary = summaryMap.get(model.id);
    return {
      ...model,
      trainTaskSummary: summary || emptySummary()
    };
  });
}

async function filterModelsByPermission({
  teamId,
  tmbId,
  isRoot
}: {
  teamId: string;
  tmbId: string;
  isRoot: boolean;
}): Promise<SystemModelItemType[]> {
  const sourceList = global.systemActiveDesensitizedModels;

  // Root sees all models
  if (isRoot) return sourceList;

  const [groups, orgs, rps] = await Promise.all([
    getGroupsByTmbId({ teamId, tmbId }),
    getOrgsByTmbId({ teamId, tmbId }),
    MongoResourcePermission.find({
      teamId,
      resourceType: PerResourceTypeEnum.model
    }).lean()
  ]);

  const myIdSet = new Set([tmbId, ...groups.map((g) => g._id), ...orgs.map((o) => o._id)]);
  const permissionModelSet = new Set(
    rps.filter((rp) => myIdSet.has(getCollaboratorId(rp))).map((rp) => String(rp.resourceId))
  );

  return sourceList.filter((model) => {
    // System models (no creator) are only visible if shared by root
    if (!model.isCustom) return model.isShared === true;
    // Globally shared custom models
    if (model.isShared) return true;
    // Creator's own models
    if (String(model.tmbId) === String(tmbId)) return true;
    // Models user has collaborator permission for
    if (model.id && permissionModelSet.has(model.id)) return true;
    return false;
  });
}

async function handler(
  req: ApiRequestProps<{}, { bufferId?: string }>,
  res: NextApiResponse
): Promise<InitDateResponse> {
  const { bufferId } = req.query;

  try {
    const { teamId, tmbId, isRoot } = await authCert({ req, authToken: true });
    // If bufferId is the same as the current bufferId, return directly
    if (bufferId && global.systemInitBufferId && global.systemInitBufferId === bufferId) {
      return {
        bufferId: global.systemInitBufferId,
        systemVersion: global.systemVersion
      };
    }

    const userAccessibleModels = await filterModelsByPermission({ teamId, tmbId, isRoot });

    return {
      bufferId: global.systemInitBufferId,
      feConfigs: global.feConfigs,
      subPlans: global.subPlans,
      systemVersion: global.systemVersion,
      activeModelList: await buildActiveModelList(userAccessibleModels, teamId),
      defaultModels: global.systemDefaultModel,
      modelProviders: global.ModelProviderRawCache,
      aiproxyChannels: global.aiproxyChannelsCache
    };
  } catch (error) {
    const referer = req.headers.referer;
    if (referer?.includes('/price')) {
      return {
        feConfigs: global.feConfigs,
        subPlans: global.subPlans,
        modelProviders: global.ModelProviderRawCache,
        aiproxyChannels: global.aiproxyChannelsCache,
        activeModelList: global.systemActiveDesensitizedModels.map((model) => ({
          ...model,
          trainTaskSummary: emptySummary()
        }))
      };
    }

    const unAuthBufferId = global.systemInitBufferId ? `unAuth_${global.systemInitBufferId}` : '';
    if (bufferId && unAuthBufferId === bufferId) {
      return {
        bufferId: unAuthBufferId,
        modelProviders: global.ModelProviderRawCache,
        aiproxyChannels: global.aiproxyChannelsCache
      };
    }

    return {
      bufferId: unAuthBufferId,
      feConfigs: global.feConfigs,
      modelProviders: global.ModelProviderRawCache,
      aiproxyChannels: global.aiproxyChannelsCache
    };
  }
}

export default NextAPI(handler);
