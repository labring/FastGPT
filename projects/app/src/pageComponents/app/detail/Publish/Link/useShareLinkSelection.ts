import { useLayoutEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUnmountedRef } from 'ahooks';
import type { OutLinkListResponseType } from '@fastgpt/global/openapi/support/outLink/api';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { getShareChatList } from '@/web/support/outLink/api';
import { useUserStore } from '@/web/support/user/useUserStore';

/** 管理分享链接列表和弹窗选择，确保打开时读取新配置且保存后的缓存不会被旧请求覆盖。 */
export const useShareLinkSelection = ({
  appId,
  onLoadError
}: {
  appId: string;
  onLoadError: () => void;
}) => {
  const { userInfo } = useUserStore();
  const teamId = userInfo?.team.teamId;
  const tmbId = userInfo?.team.tmbId;
  const queryKey = ['initShareChatList', appId, teamId, tmbId];
  const queryClient = useQueryClient();
  const unmounted = useUnmountedRef();
  const openSequence = useRef(0);
  const [selection, setSelection] = useState<{ id: string; teamId: string; tmbId: string }>();
  const currentAppId = useRef(appId);
  useLayoutEffect(() => {
    currentAppId.current = appId;
  }, [appId]);
  const {
    isFetching,
    data: shareChatList = [],
    refetch: refetchShareChatList
  } = useQuery(
    queryKey,
    async () => {
      const list = await getShareChatList({ appId, type: PublishChannelEnum.share });
      const currentMember = useUserStore.getState().userInfo?.team;
      if (currentMember?.teamId !== teamId || currentMember?.tmbId !== tmbId)
        throw new Error('Team context changed while loading share links');
      return list;
    },
    { enabled: !!teamId && !!tmbId }
  );

  const openLink = async (id: string) => {
    const sequence = ++openSequence.current;
    const member = useUserStore.getState().userInfo?.team;
    if (!member || member.teamId !== teamId || member.tmbId !== tmbId) return;
    const result = await refetchShareChatList();
    const currentMember = useUserStore.getState().userInfo?.team;
    if (
      unmounted.current ||
      currentAppId.current !== appId ||
      sequence !== openSequence.current ||
      member?.teamId !== currentMember?.teamId ||
      member?.tmbId !== currentMember?.tmbId
    )
      return;
    if (result.isError || !result.data?.some((item) => item._id === id)) {
      onLoadError();
      return;
    }
    setSelection({ id, teamId: member.teamId, tmbId: member.tmbId });
  };

  const closeLink = () => {
    openSequence.current++;
    setSelection(undefined);
  };

  const onBrandSaved = async (id: string, isShowBrand: boolean) => {
    // 取消已发出的列表请求，防止保存前的响应回填旧状态。
    await queryClient.cancelQueries({ queryKey });
    const currentMember = useUserStore.getState().userInfo?.team;
    if (
      unmounted.current ||
      currentAppId.current !== appId ||
      currentMember?.teamId !== teamId ||
      currentMember?.tmbId !== tmbId
    )
      return;
    queryClient.setQueryData<OutLinkListResponseType>(queryKey, (previous) =>
      previous?.map((item) => (item._id === id ? { ...item, isShowBrand } : item))
    );
    void refetchShareChatList();
  };

  return {
    isFetching,
    shareChatList,
    refetchShareChatList,
    selectedLinkData:
      selection && selection.teamId === teamId && selection.tmbId === tmbId
        ? shareChatList.find((item) => item._id === selection.id)
        : undefined,
    openLink,
    closeLink,
    onBrandSaved
  };
};
