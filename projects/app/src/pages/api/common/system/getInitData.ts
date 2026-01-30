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
import {
  getPluginDatasets,
  type PluginDatasetType
} from '@fastgpt/service/core/dataset/pluginDataset/controller';

export type { PluginDatasetType };

export type InitDateResponse = {
  bufferId?: string;

  feConfigs?: FastGPTFeConfigsType;
  subPlans?: SubPlanType;
  systemVersion?: string;

  activeModelList?: SystemModelItemType[];
  defaultModels?: SystemDefaultModelType;
  modelProviders?: { provider: string; value: I18nStringStrictType; avatar: string }[];
  aiproxyIdMap?: AiproxyMapProviderType;
  pluginDatasets?: PluginDatasetType[];
  pluginDatasetsVersionKey?: string;
};

async function handler(
  req: ApiRequestProps<{}, { bufferId?: string; pluginDatasetsVersionKey?: string }>,
  res: NextApiResponse
): Promise<InitDateResponse> {
  const { bufferId, pluginDatasetsVersionKey } = req.query;

  // 获取 pluginDatasets 数据
  const pluginDatasetsResult = await getPluginDatasets({ versionKey: pluginDatasetsVersionKey });

  try {
    await authCert({ req, authToken: true });
    // If bufferId is the same as the current bufferId, return directly
    if (bufferId && global.systemInitBufferId && global.systemInitBufferId === bufferId) {
      return {
        bufferId: global.systemInitBufferId,
        systemVersion: global.systemVersion,
        pluginDatasets: pluginDatasetsResult.isRefreshed
          ? pluginDatasetsResult.pluginDatasets
          : undefined,
        pluginDatasetsVersionKey: pluginDatasetsResult.versionKey
      };
    }

    return {
      bufferId: global.systemInitBufferId,
      feConfigs: global.feConfigs,
      subPlans: global.subPlans,
      systemVersion: global.systemVersion,
      activeModelList: global.systemActiveDesensitizedModels,
      defaultModels: global.systemDefaultModel,
      modelProviders: global.ModelProviderRawCache,
      aiproxyIdMap: global.aiproxyIdMapCache,
      pluginDatasets: pluginDatasetsResult.isRefreshed
        ? pluginDatasetsResult.pluginDatasets
        : undefined,
      pluginDatasetsVersionKey: pluginDatasetsResult.versionKey
    };
  } catch (error) {
    const referer = req.headers.referer;
    if (referer?.includes('/price')) {
      return {
        feConfigs: global.feConfigs,
        subPlans: global.subPlans,
        modelProviders: global.ModelProviderRawCache,
        aiproxyIdMap: global.aiproxyIdMapCache,
        activeModelList: global.systemActiveDesensitizedModels
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
      aiproxyIdMap: global.aiproxyIdMapCache,
      pluginDatasets: pluginDatasetsResult.isRefreshed
        ? pluginDatasetsResult.pluginDatasets
        : undefined,
      pluginDatasetsVersionKey: pluginDatasetsResult.versionKey
    };
  }
}

export default NextAPI(handler);
