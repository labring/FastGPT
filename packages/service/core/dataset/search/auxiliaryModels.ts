import type { AppDatasetSearchParamsType } from '@fastgpt/global/core/app/type';
import { isModelConfigError } from '@fastgpt/global/common/error/model';
import {
  getDefaultLLMModelData,
  getDefaultRerankModelData,
  getLLMModelData,
  getRerankModelData
} from '../../ai/model';

/**
 * 搜索辅助模型优先使用用户配置，未填写、停用、缺失或类型不符时回退对应系统默认。
 * 默认也不可用则不启用该增强；不处理向量模型，也不吞掉非模型配置异常。
 * 返回实际使用的模型对象，供搜索、计费和节点详情使用同一份配置。
 */
export const getDatasetSearchAuxiliaryModels = ({
  usingReRank,
  rerankModelId,
  rerankModel,
  datasetSearchUsingExtensionQuery,
  datasetSearchExtensionModelId,
  datasetSearchExtensionModel
}: Pick<
  AppDatasetSearchParamsType,
  | 'usingReRank'
  | 'rerankModelId'
  | 'rerankModel'
  | 'datasetSearchUsingExtensionQuery'
  | 'datasetSearchExtensionModelId'
  | 'datasetSearchExtensionModel'
>) => {
  /** 只降级模型配置错误；程序或基础设施异常仍交由外层处理。 */
  const resolve = <T>({
    enabled,
    getSelected,
    getDefault
  }: {
    enabled?: boolean;
    getSelected: () => T;
    getDefault: () => T;
  }): T | undefined => {
    if (!enabled) return;
    for (const getter of [getSelected, getDefault]) {
      try {
        return getter();
      } catch (error) {
        if (!isModelConfigError(error)) {
          throw error;
        }
      }
    }
  };

  return {
    rerankModelData: resolve({
      enabled: usingReRank,
      getSelected: () => getRerankModelData({ modelId: rerankModelId, model: rerankModel }),
      getDefault: getDefaultRerankModelData
    }),
    extensionModelData: resolve({
      enabled: datasetSearchUsingExtensionQuery,
      getSelected: () =>
        getLLMModelData({
          modelId: datasetSearchExtensionModelId,
          model: datasetSearchExtensionModel
        }),
      getDefault: getDefaultLLMModelData
    })
  };
};
