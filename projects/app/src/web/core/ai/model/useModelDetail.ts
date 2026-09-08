import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ModelDisplayDetail } from '@fastgpt/global/openapi/core/ai/model/detail';
import type { MyModelItemType } from '@fastgpt/global/openapi/core/ai/model/api';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { getUserModelDetails } from '@/web/common/system/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useUserModelStore } from './useUserModelStore';
import { createModelDetailLoader } from './modelDetailLoader';
import { isEmptyModelValue } from '@fastgpt/global/core/ai/modelReference';

const loadDetail = createModelDetailLoader(getUserModelDetails);

/** 收起态独立获取模型展示详情；身份/ID 变化或卸载后丢弃旧响应，不把请求失败当作下架。 */
export const useModelDetail = ({
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
    detail?: ModelDisplayDetail;
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
    loadDetail({ identity, modelId, outLinkAuthData: auth }).then(
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
  }, [auth, identity, requestKey, modelId, revision]);

  const current = state.key === requestKey ? state : undefined;
  const cached = identity && modelId ? loadDetail.peek({ identity, modelId }) : undefined;
  return {
    detail: key ? (cached ?? current?.detail) : undefined,
    loading: !!modelId && !cached && (!requestKey || !current),
    error: !!key && !cached && !!current?.error,
    refresh,
    setFromCatalog
  };
};
