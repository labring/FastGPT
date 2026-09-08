import { getUserModelSummaries } from '@/web/common/system/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import { isEmptyModelValue } from '@fastgpt/global/core/ai/modelReference';
import type { MyModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';
import type { ModelSummary } from '@fastgpt/global/openapi/core/ai/model/summary';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getModelReadIdentity, peekModelCatalog, type ModelReadOptions } from './modelData';
import { createModelSummaryLoader } from './modelSummaryLoader';
import { useUserModelStore } from './useUserModelStore';

const loadDetail = createModelSummaryLoader(getUserModelSummaries);

/** 摘要优先复用完整目录；未命中才请求轻量接口，不触发 catalog 加载。 */
export const getModelSummary = async (options: ModelReadOptions & { modelId?: string }) => {
  if (isEmptyModelValue(options.modelId)) return;
  const identity = getModelReadIdentity(options);
  if (!identity) throw new Error('Model viewer identity is unavailable');
  const model = peekModelCatalog(options)?.modelMap[options.modelId!];
  if (model)
    return {
      modelId: model.modelId,
      name: model.name,
      avatar: model.avatar,
      status: 'active' as const
    };
  const summary = await loadDetail({
    identity: identity.key,
    modelId: options.modelId!,
    outLinkAuthData: options.outLinkAuthData
  });
  if (getModelReadIdentity(options)?.key !== identity.key)
    throw new Error('Model viewer identity changed during loading');
  const current = peekModelCatalog(options)?.modelMap[options.modelId!];
  return current
    ? {
        modelId: current.modelId,
        name: current.name,
        avatar: current.avatar,
        status: 'active' as const
      }
    : summary;
};

/** 收起态独立获取模型展示详情；身份/ID 变化或卸载后丢弃旧响应，不把请求失败当作下架。 */
export const useModelSummary = ({
  modelId: inputModelId,
  outLinkAuthData
}: {
  modelId?: string;
  outLinkAuthData?: OutLinkChatAuthProps;
}) => {
  const modelId = isEmptyModelValue(inputModelId) ? undefined : inputModelId;
  const teamId = useUserStore((state) => state.userInfo?.team?.teamId);
  const tmbId = useUserStore((state) => state.userInfo?.team?.tmbId);
  const loginGeneration = useUserModelStore((state) => state.loginGeneration);
  const catalogModels = useUserModelStore((state) => state.modelMap);
  const shareId = outLinkAuthData?.shareId;
  const outLinkUid = outLinkAuthData?.outLinkUid;
  const auth = useMemo(
    () => (shareId && outLinkUid ? { shareId, outLinkUid } : undefined),
    [shareId, outLinkUid]
  );
  const identity = auth
    ? JSON.stringify(['outlink', shareId, outLinkUid, loginGeneration])
    : teamId && tmbId
      ? JSON.stringify([teamId, tmbId, loginGeneration])
      : undefined;
  const key = identity && modelId ? JSON.stringify([identity, modelId]) : undefined;
  const [revision, setRevision] = useState(0);
  const requestKey = key ? JSON.stringify([key, revision]) : undefined;
  const [state, setState] = useState<{
    key?: string;
    detail?: ModelSummary;
    error?: boolean;
  }>({});
  const refresh = useCallback(() => {
    if (identity && modelId) loadDetail.invalidate({ identity, modelId });
    setRevision((value) => value + 1);
  }, [identity, modelId, setRevision]);
  /** 只接收刚通过候选目录确认的模型；缓存先写入，再由调用方更新选中的 ID。 */
  const setFromCatalog = useCallback(
    (model: Pick<MyModelItemType, 'modelId' | 'name' | 'avatar'>) => {
      if (!identity) return;
      loadDetail.prime({
        identity,
        detail: {
          modelId: model.modelId,
          name: model.name,
          avatar: model.avatar,
          status: 'active'
        }
      });
      setRevision((value) => value + 1);
    },
    [identity, setRevision]
  );

  useEffect(() => {
    if (!requestKey || !identity || !modelId) return;
    let active = true;
    getModelSummary({ modelId, outLinkAuthData: auth }).then(
      (detail) => {
        if (active) setState({ key: requestKey, detail });
      },
      () => {
        if (active) setState({ key: requestKey, error: true });
      }
    );
    return () => {
      active = false;
    };
  }, [auth, identity, requestKey, modelId, revision, catalogModels]);

  const current = state.key === requestKey ? state : undefined;
  const cached = identity && modelId ? loadDetail.peek({ identity, modelId }) : undefined;
  const catalogModel = modelId
    ? peekModelCatalog({ outLinkAuthData: auth })?.modelMap[modelId]
    : undefined;
  const summary: ModelSummary | undefined = catalogModel
    ? {
        modelId: catalogModel.modelId,
        name: catalogModel.name,
        avatar: catalogModel.avatar,
        status: 'active'
      }
    : (cached ?? current?.detail);
  return {
    detail: key ? summary : undefined,
    loading: !!modelId && !summary && (!requestKey || !current),
    error: !!key && !summary && !!current?.error,
    refresh,
    setFromCatalog
  };
};
