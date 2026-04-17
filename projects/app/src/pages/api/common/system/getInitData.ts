import type { NextApiResponse } from 'next';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types';
import type { SubPlanType } from '@fastgpt/global/support/wallet/sub/type';
import type { SystemDefaultModelType, SystemModelItemType } from '@fastgpt/service/core/ai/type';
import type {
  AiproxyMapProviderType,
  I18nStringStrictType
} from '@fastgpt/global/sdk/fastgpt-plugin';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import { MongoEmbeddingTrainTask } from '@fastgpt/service/core/train/embedding/task/schema';
import { MongoRerankTrainTask } from '@fastgpt/service/core/train/rerank/task/schema';
import { resolveEmbeddingTasksByTunedModelId } from '@fastgpt/service/core/train/embedding/task/controller';
import { resolveRerankTasksByTunedModelId } from '@fastgpt/service/core/train/rerank/task/controller';
import { buildEmbeddingTrainTaskAggregationPipeline } from '@fastgpt/service/core/train/embedding/task/utils';
import { buildRerankTrainTaskAggregationPipeline } from '@fastgpt/service/core/train/rerank/task/utils';
import type { EmbeddingTrainTaskListItem } from '@fastgpt/global/core/train/embedding/api';
import type { RerankTrainTaskListItem } from '@fastgpt/global/core/train/rerank/api';
import { Types } from '@fastgpt/service/common/mongo';

export type ActiveModelListItem = SystemModelItemType & {
  trainTaskList: (EmbeddingTrainTaskListItem | RerankTrainTaskListItem)[];
};

export type InitDateResponse = {
  bufferId?: string;

  feConfigs?: FastGPTFeConfigsType;
  subPlans?: SubPlanType;
  systemVersion?: string;

  activeModelList?: ActiveModelListItem[];
  defaultModels?: SystemDefaultModelType;
  modelProviders?: { provider: string; value: I18nStringStrictType; avatar: string }[];
  aiproxyIdMap?: AiproxyMapProviderType;
};

async function buildActiveModelList(
  models: SystemModelItemType[],
  teamId: string
): Promise<ActiveModelListItem[]> {
  return Promise.all(
    models.map(async (model) => {
      if (model.type !== ModelTypeEnum.embedding && model.type !== ModelTypeEnum.rerank) {
        return { ...model, trainTaskList: [] };
      }

      if (model.type === ModelTypeEnum.embedding) {
        const matchQuery = model.isTuned
          ? {
              _id: {
                $in: (await resolveEmbeddingTasksByTunedModelId(model.model, teamId)).map(
                  (t) => new Types.ObjectId(t._id)
                )
              }
            }
          : { teamId: new Types.ObjectId(teamId), baseModelId: model.model };
        const tasks = await MongoEmbeddingTrainTask.aggregate([
          { $match: matchQuery },
          { $sort: { createTime: -1 } },
          ...buildEmbeddingTrainTaskAggregationPipeline()
        ]);
        return { ...model, trainTaskList: tasks as EmbeddingTrainTaskListItem[] };
      }

      // ModelTypeEnum.rerank
      const matchQuery = model.isTuned
        ? {
            _id: {
              $in: (await resolveRerankTasksByTunedModelId(model.model, teamId)).map(
                (t) => new Types.ObjectId(t._id)
              )
            }
          }
        : { teamId: new Types.ObjectId(teamId), baseModelId: model.model };
      const tasks = await MongoRerankTrainTask.aggregate([
        { $match: matchQuery },
        { $sort: { createTime: -1 } },
        ...buildRerankTrainTaskAggregationPipeline()
      ]);
      return { ...model, trainTaskList: tasks as RerankTrainTaskListItem[] };
    })
  );
}

async function handler(
  req: ApiRequestProps<{}, { bufferId?: string }>,
  res: NextApiResponse
): Promise<InitDateResponse> {
  const { bufferId } = req.query;

  try {
    const { teamId } = await authCert({ req, authToken: true });
    // If bufferId is the same as the current bufferId, return directly
    if (bufferId && global.systemInitBufferId && global.systemInitBufferId === bufferId) {
      return {
        bufferId: global.systemInitBufferId,
        systemVersion: global.systemVersion
      };
    }

    return {
      bufferId: global.systemInitBufferId,
      feConfigs: global.feConfigs,
      subPlans: global.subPlans,
      systemVersion: global.systemVersion,
      activeModelList: await buildActiveModelList(global.systemActiveDesensitizedModels, teamId),
      defaultModels: global.systemDefaultModel,
      modelProviders: global.ModelProviderRawCache,
      aiproxyIdMap: global.aiproxyIdMapCache
    };
  } catch (error) {
    const referer = req.headers.referer;
    if (referer?.includes('/price')) {
      return {
        feConfigs: global.feConfigs,
        subPlans: global.subPlans,
        modelProviders: global.ModelProviderRawCache,
        aiproxyIdMap: global.aiproxyIdMapCache,
        activeModelList: global.systemActiveDesensitizedModels.map((model) => ({
          ...model,
          trainTaskList: []
        }))
      };
    }

    const unAuthBufferId = global.systemInitBufferId ? `unAuth_${global.systemInitBufferId}` : '';
    if (bufferId && unAuthBufferId === bufferId) {
      return {
        bufferId: unAuthBufferId,
        modelProviders: global.ModelProviderRawCache,
        aiproxyIdMap: global.aiproxyIdMapCache
      };
    }

    return {
      bufferId: unAuthBufferId,
      feConfigs: global.feConfigs,
      modelProviders: global.ModelProviderRawCache,
      aiproxyIdMap: global.aiproxyIdMapCache
    };
  }
}

export default NextAPI(handler);
