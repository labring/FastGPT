import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { MyModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';
import { useEffect, useMemo } from 'react';
import { useUserModelStore } from './useUserModelStore';
import { useUserStore } from '@/web/support/user/useUserStore';

type MyModelByType<T extends ModelTypeEnum> = Extract<MyModelItemType, { type: T }>;

/** 加载当前成员目录并提供按类型划分的响应式视图。 */
export const useUserModelLists = () => {
  const { identity, modelList, loading, loaded, loadModelCatalog } = useUserModelStore();
  const teamId = useUserStore((state) => state.userInfo?.team?.teamId);
  const tmbId = useUserStore((state) => state.userInfo?.team?.tmbId);
  const expectedIdentity = teamId && tmbId ? `${teamId}:${tmbId}` : undefined;
  const isCurrentIdentity = !!expectedIdentity && identity === expectedIdentity;

  useEffect(() => {
    if (teamId && tmbId) loadModelCatalog({ teamId, tmbId }).catch(() => {});
  }, [loadModelCatalog, teamId, tmbId]);

  return useMemo(() => {
    // 身份变化到 effect 开始加载之间不暴露上一成员目录，避免一次渲染中的跨成员数据闪现。
    const visibleModelList = isCurrentIdentity ? modelList : [];
    const llmModelList = visibleModelList.filter(
      (model): model is MyModelByType<ModelTypeEnum.llm> => model.type === ModelTypeEnum.llm
    );
    const embeddingModelList = visibleModelList.filter(
      (model): model is MyModelByType<ModelTypeEnum.embedding> =>
        model.type === ModelTypeEnum.embedding
    );
    const ttsModelList = visibleModelList.filter(
      (model): model is MyModelByType<ModelTypeEnum.tts> => model.type === ModelTypeEnum.tts
    );
    const sttModelList = visibleModelList.filter(
      (model): model is MyModelByType<ModelTypeEnum.stt> => model.type === ModelTypeEnum.stt
    );
    const reRankModelList = visibleModelList.filter(
      (model): model is MyModelByType<ModelTypeEnum.rerank> => model.type === ModelTypeEnum.rerank
    );

    return {
      loading: !!expectedIdentity && (!isCurrentIdentity || loading),
      loaded: isCurrentIdentity && loaded,
      modelList: visibleModelList,
      llmModelList,
      embeddingModelList,
      ttsModelList,
      sttModelList,
      reRankModelList,
      vlmModelList: llmModelList.filter((model) => !!model.config.vision)
    };
  }, [expectedIdentity, isCurrentIdentity, loaded, modelList, loading]);
};
