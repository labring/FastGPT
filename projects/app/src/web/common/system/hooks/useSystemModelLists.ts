import { getMyModels } from '@/web/common/system/api';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { MyModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useMemo } from 'react';

type MyModelByType<T extends ModelTypeEnum> = Extract<MyModelItemType, { type: T }>;

/**
 * 为仍需枚举模型的页面加载当前成员的完整模型列表。结果只在组件生命周期内存在，不写入
 * Zustand/localStorage；模型选择器不使用这个 hook，而是自行按 Provider 分页。
 */
export const useSystemModelLists = () => {
  const { data, loading } = useRequest(
    async () => {
      const pageSize = 100;
      let pageNum = 1;
      let total = 0;
      const models: MyModelItemType[] = [];

      do {
        const response = await getMyModels({ pageNum, pageSize });
        total = response.total;
        models.push(...response.list);
        pageNum += 1;
      } while (models.length < total);

      return models;
    },
    { manual: false, errorToast: '' }
  );

  return useMemo(() => {
    const models = data ?? [];
    const llmModelList = models.filter(
      (model): model is MyModelByType<ModelTypeEnum.llm> => model.type === ModelTypeEnum.llm
    );
    const embeddingModelList = models.filter(
      (model): model is MyModelByType<ModelTypeEnum.embedding> =>
        model.type === ModelTypeEnum.embedding
    );
    const ttsModelList = models.filter(
      (model): model is MyModelByType<ModelTypeEnum.tts> => model.type === ModelTypeEnum.tts
    );
    const sttModelList = models.filter(
      (model): model is MyModelByType<ModelTypeEnum.stt> => model.type === ModelTypeEnum.stt
    );
    const reRankModelList = models.filter(
      (model): model is MyModelByType<ModelTypeEnum.rerank> => model.type === ModelTypeEnum.rerank
    );

    return {
      loading,
      modelList: models,
      llmModelList,
      embeddingModelList,
      ttsModelList,
      sttModelList,
      reRankModelList,
      vlmModelList: llmModelList.filter((model) => !!model.config.vision)
    };
  }, [data, loading]);
};
