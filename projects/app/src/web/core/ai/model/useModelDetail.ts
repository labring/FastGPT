import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ModelDisplayDetail } from '@fastgpt/global/openapi/core/ai/model/detail';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { getUserModelDetails } from '@/web/common/system/api';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useUserModelStore } from './useUserModelStore';
import { createModelDetailLoader } from './modelDetailLoader';

const loadDetail = createModelDetailLoader(getUserModelDetails);

/** 收起态独立获取模型展示详情；身份/ID 变化或卸载后丢弃旧响应，不把请求失败当作下架。 */
export const useModelDetail = ({
  modelId,
  outLinkAuthData
}: {
  modelId?: string;
  outLinkAuthData?: OutLinkChatAuthProps;
}) => {
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
  const refresh = useCallback(() => setRevision((value) => value + 1), [setRevision]);

  useEffect(() => {
    if (!requestKey || !identity || !modelId) return;
    let active = true;
    loadDetail({ identity, modelId, outLinkAuthData: auth, force: revision > 0 }).then(
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
  return {
    detail: key ? current?.detail : undefined,
    loading: !!modelId && (!requestKey || !current),
    error: !!key && !!current?.error,
    refresh
  };
};
