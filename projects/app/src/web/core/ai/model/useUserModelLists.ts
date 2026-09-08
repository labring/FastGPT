import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { MyModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';
import { useEffect, useMemo, useState } from 'react';
import { useUserModelStore } from './useUserModelStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

type MyModelByType<T extends ModelTypeEnum> = Extract<MyModelItemType, { type: T }>;

/** 仅反映当前消费者是否仍在等待目录校验，避免其他消费者的请求触发全局 loading。 */
export const getUserModelListsLoading = ({
  autoLoadCatalog,
  expectedIdentity,
  isCurrentIdentity,
  requestKey,
  validatedRequestKey
}: {
  autoLoadCatalog: boolean;
  expectedIdentity?: string;
  isCurrentIdentity: boolean;
  requestKey?: string;
  validatedRequestKey?: string;
}) =>
  autoLoadCatalog &&
  !!expectedIdentity &&
  (validatedRequestKey !== requestKey || !isCurrentIdentity);

/** 按登录成员或外链运行身份加载目录，并提供按类型划分的响应式视图。 */
export const useUserModelLists = ({
  outLinkAuthData,
  autoLoadCatalog = true
}: {
  outLinkAuthData?: OutLinkChatAuthProps;
  /** 是否主动加载/校验 catalog；false 时只订阅当前身份的缓存数据。默认 true。 */
  autoLoadCatalog?: boolean;
} = {}) => {
  const { identity, modelList, loaded, loadModelCatalog } = useUserModelStore();
  const teamId = useUserStore((state) => state.userInfo?.team?.teamId);
  const tmbId = useUserStore((state) => state.userInfo?.team?.tmbId);
  const outLinkShareId = outLinkAuthData?.shareId;
  const outLinkUid = outLinkAuthData?.outLinkUid;
  const validOutLinkAuthData = useMemo(
    () => (outLinkShareId && outLinkUid ? { shareId: outLinkShareId, outLinkUid } : undefined),
    [outLinkShareId, outLinkUid]
  );
  const expectedIdentity = validOutLinkAuthData
    ? `outlink:${validOutLinkAuthData.shareId}`
    : teamId && tmbId
      ? `${teamId}:${tmbId}`
      : undefined;
  const isCurrentIdentity = !!expectedIdentity && identity === expectedIdentity;
  const requestKey = validOutLinkAuthData
    ? `${expectedIdentity}:${validOutLinkAuthData.outLinkUid}`
    : expectedIdentity;
  const activeRequestKey = autoLoadCatalog ? requestKey : undefined;
  const [requestState, setRequestState] = useState<{
    key?: string;
    validatedRequestKey?: string;
    error: boolean;
  }>({ key: activeRequestKey, error: false });
  // 每次重新展开都是一次新的校验；同步派生 loading，避免先展示上次目录再切换加载态。
  if (requestState.key !== activeRequestKey) {
    setRequestState({ key: activeRequestKey, error: false });
  }

  useEffect(() => {
    if (!autoLoadCatalog || !requestKey) return;
    let active = true;
    let error = false;

    // 每个消费者都会校验目录；同时发起时由 Store 复用相同身份的 in-flight Promise。
    const request = validOutLinkAuthData
      ? loadModelCatalog({ outLinkAuthData: validOutLinkAuthData })
      : teamId && tmbId
        ? loadModelCatalog({ teamId, tmbId })
        : Promise.resolve();
    request
      .catch(() => {
        error = true;
      })
      .finally(() => {
        if (active) setRequestState({ key: requestKey, validatedRequestKey: requestKey, error });
      });

    return () => {
      active = false;
    };
  }, [autoLoadCatalog, loadModelCatalog, requestKey, teamId, tmbId, validOutLinkAuthData]);

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
      loading: getUserModelListsLoading({
        autoLoadCatalog,
        expectedIdentity,
        isCurrentIdentity,
        requestKey,
        validatedRequestKey: requestState.validatedRequestKey
      }),
      loaded: isCurrentIdentity && loaded,
      modelList: visibleModelList,
      error: autoLoadCatalog && requestState.error,
      llmModelList,
      embeddingModelList,
      ttsModelList,
      sttModelList,
      reRankModelList,
      vlmModelList: llmModelList.filter((model) => !!model.config.vision)
    };
  }, [
    autoLoadCatalog,
    expectedIdentity,
    isCurrentIdentity,
    loaded,
    modelList,
    requestState,
    requestKey
  ]);
};
