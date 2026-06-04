import type { NextApiResponse } from 'next';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
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
import type { SourceMemberType } from '@fastgpt/global/support/user/type';
import { ReadPermissionVal, ReadRoleVal } from '@fastgpt/global/support/permission/constant';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import type {
  EmbeddingModelItemType,
  LLMModelItemType,
  RerankModelItemType,
  STTModelType,
  TTSModelType
} from '@fastgpt/global/core/ai/model.schema';
import { getModelListWithPermission } from '@fastgpt/service/support/permission/model/controller';
import { ModelPermission } from '@fastgpt/global/support/permission/model/controller';

type ModelWithPermission = SystemModelItemType & {
  permission: ModelPermission;
};

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
  permission: ModelPermission;
  trainTaskSummary: TrainTaskSummary;
  sourceMember?: SourceMemberType;
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
  models: ModelWithPermission[],
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

  // Build result list with train task summaries
  const resultList = models.map((model) => ({
    ...model,
    trainTaskSummary:
      model.type === ModelTypeEnum.embedding || model.type === ModelTypeEnum.rerank
        ? summaryMap.get(model.id) || emptySummary()
        : emptySummary()
  }));

  const tmbIds = [...new Set(resultList.map((item) => item.tmbId).filter(Boolean) as string[])];
  const members = tmbIds.length
    ? await MongoTeamMember.find(
        { _id: { $in: tmbIds.map((id) => new Types.ObjectId(id)) } },
        { name: 1, avatar: 1, status: 1 }
      ).lean()
    : [];
  const sourceMemberMap = new Map<string, SourceMemberType>(
    members.map((member) => [
      String(member._id),
      {
        name: member.name,
        avatar: member.avatar ?? undefined,
        status: member.status
      }
    ])
  );

  return resultList.map((item) => ({
    ...item,
    ...(item.tmbId
      ? {
          sourceMember: sourceMemberMap.get(String(item.tmbId))
        }
      : {})
  }));
}

async function filterModelsByPermission({
  teamId,
  tmbId,
  isRoot,
  teamPer
}: {
  teamId: string;
  tmbId: string;
  isRoot: boolean;
  teamPer: { isOwner: boolean };
}): Promise<ModelWithPermission[]> {
  return getModelListWithPermission({
    models: global.systemActiveDesensitizedModels,
    teamId,
    tmbId,
    teamPer,
    isRoot
  });
}

function getDefaultModelsByPermission(models: SystemModelItemType[]): SystemDefaultModelType {
  const modelIdSet = new Set(models.map((model) => model.id));
  const getVisibleModel = <T extends SystemModelItemType | undefined>(model: T): T | undefined => {
    if (!model?.id) return undefined;
    return modelIdSet.has(model.id) ? model : undefined;
  };
  const llmModels = models.filter(
    (model): model is LLMModelItemType => model.type === ModelTypeEnum.llm
  );
  const embeddingModels = models.filter(
    (model): model is EmbeddingModelItemType => model.type === ModelTypeEnum.embedding
  );
  const ttsModels = models.filter(
    (model): model is TTSModelType => model.type === ModelTypeEnum.tts
  );
  const sttModels = models.filter(
    (model): model is STTModelType => model.type === ModelTypeEnum.stt
  );
  const rerankModels = models.filter(
    (model): model is RerankModelItemType => model.type === ModelTypeEnum.rerank
  );

  return {
    [ModelTypeEnum.llm]:
      getVisibleModel(global.systemDefaultModel[ModelTypeEnum.llm]) || llmModels[0],
    datasetTextLLM: getVisibleModel(global.systemDefaultModel.datasetTextLLM) || llmModels[0],
    datasetImageLLM: getVisibleModel(global.systemDefaultModel.datasetImageLLM) || undefined,
    evaluation:
      getVisibleModel(global.systemDefaultModel.evaluation) ||
      llmModels.find((model) => model.useInEvaluation),
    helperBotLLM: getVisibleModel(global.systemDefaultModel.helperBotLLM) || llmModels[0],
    [ModelTypeEnum.embedding]:
      getVisibleModel(global.systemDefaultModel[ModelTypeEnum.embedding]) || embeddingModels[0],
    [ModelTypeEnum.tts]:
      getVisibleModel(global.systemDefaultModel[ModelTypeEnum.tts]) || ttsModels[0],
    [ModelTypeEnum.stt]:
      getVisibleModel(global.systemDefaultModel[ModelTypeEnum.stt]) || sttModels[0],
    [ModelTypeEnum.rerank]:
      getVisibleModel(global.systemDefaultModel[ModelTypeEnum.rerank]) || rerankModels[0]
  };
}

async function handler(
  req: ApiRequestProps<{}, { bufferId?: string }>,
  res: NextApiResponse
): Promise<InitDateResponse> {
  const { bufferId } = req.query;

  try {
    const {
      teamId,
      tmbId,
      isRoot,
      permission: teamPer
    } = await authUserPer({
      req,
      authToken: true,
      per: ReadPermissionVal
    });
    // If bufferId is the same as the current bufferId, return directly
    if (bufferId && global.systemInitBufferId && global.systemInitBufferId === bufferId) {
      return {
        bufferId: global.systemInitBufferId,
        systemVersion: global.systemVersion
      };
    }

    const userAccessibleModels = await filterModelsByPermission({
      teamId,
      tmbId,
      isRoot,
      teamPer
    });

    return {
      bufferId: global.systemInitBufferId,
      feConfigs: global.feConfigs,
      subPlans: global.subPlans,
      systemVersion: global.systemVersion,
      activeModelList: await buildActiveModelList(userAccessibleModels, teamId),
      defaultModels: getDefaultModelsByPermission(userAccessibleModels),
      modelProviders: global.ModelProviderRawCache,
      aiproxyChannels: global.aiproxyChannelsCache
    };
  } catch (error) {
    const referer = req.headers?.referer;
    if (referer?.includes('/price')) {
      return {
        feConfigs: global.feConfigs,
        subPlans: global.subPlans,
        modelProviders: global.ModelProviderRawCache,
        aiproxyChannels: global.aiproxyChannelsCache,
        activeModelList: global.systemActiveDesensitizedModels
          .filter((model) => !model.isCustom)
          .map((model) => ({
            ...model,
            permission: new ModelPermission({ role: ReadRoleVal }),
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
