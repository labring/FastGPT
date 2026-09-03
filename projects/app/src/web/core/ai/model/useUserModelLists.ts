import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { MyModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';
import { useEffect, useMemo, useState } from 'react';
import { useUserModelStore } from './useUserModelStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

type MyModelByType<T extends ModelTypeEnum> = Extract<MyModelItemType, { type: T }>;

/** 仅反映当前消费者是否仍在等待目录校验，避免其他消费者的请求触发全局 loading。 */
export const getUserModelListsLoading = ({
  enabled,
  expectedIdentity,
  isCurrentIdentity,
  requestKey,
  validatedRequestKey
}: {
  enabled: boolean;
  expectedIdentity?: string;
  isCurrentIdentity: boolean;
  requestKey?: string;
  validatedRequestKey?: string;
}) => enabled && !!expectedIdentity && (validatedRequestKey !== requestKey || !isCurrentIdentity);

/** 按登录成员或外链运行身份加载目录，并提供按类型划分的响应式视图。 */
export const useUserModelLists = ({
  outLinkAuthData,
  enabled = true
}: {
  outLinkAuthData?: OutLinkChatAuthProps;
  enabled?: boolean;
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
  const [validatedRequestKey, setValidatedRequestKey] = useState<string>();

  useEffect(() => {
    if (!enabled || !requestKey) return;

    // 每个消费者都会校验目录；同时发起时由 Store 复用相同身份的 in-flight Promise。
    const request = validOutLinkAuthData
      ? loadModelCatalog({ outLinkAuthData: validOutLinkAuthData }).catch(() => {})
      : teamId && tmbId
        ? loadModelCatalog({ teamId, tmbId }).catch(() => {})
        : Promise.resolve();
    let active = true;
    request.finally(() => {
      if (active) setValidatedRequestKey(requestKey);
    });

    return () => {
      active = false;
    };
  }, [enabled, loadModelCatalog, requestKey, teamId, tmbId, validOutLinkAuthData]);

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
        enabled,
        expectedIdentity,
        isCurrentIdentity,
        requestKey,
        validatedRequestKey
      }),
      loaded: isCurrentIdentity && loaded,
      modelList: visibleModelList,
      llmModelList,
      embeddingModelList,
      ttsModelList,
      sttModelList,
      reRankModelList,
      vlmModelList: llmModelList.filter((model) => !!model.config.vision)
    };
  }, [
    enabled,
    expectedIdentity,
    isCurrentIdentity,
    loaded,
    modelList,
    requestKey,
    validatedRequestKey
  ]);
};
