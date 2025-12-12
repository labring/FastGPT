import { useState, useCallback, useEffect } from 'react';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getFeedbackIndices } from '@/web/core/chat/api';
import type { ChatSiteItemType } from '@fastgpt/global/core/chat/type';
import { useMemoEnhance } from '@fastgpt/web/hooks/useMemoEnhance';

export const useFeedbackNavigation = ({
  appId,
  chatId,
  chatRecords,
  feedbackType,
  unreadOnly,
  refreshTrigger
}: {
  appId: string;
  chatId: string;
  chatRecords: ChatSiteItemType[];
  feedbackType: 'all' | 'good' | 'bad';
  unreadOnly?: boolean;
  refreshTrigger: boolean;
}) => {
  const [currentIndex, setCurrentIndex] = useState<number>(-1);

  const { data: feedbackIndices, loading: indicesLoading } = useRequest2(
    async () => {
      if (!appId || !chatId) return { total: 0, indices: [] };
      return getFeedbackIndices({ appId, chatId, feedbackType, unreadOnly });
    },
    {
      manual: false,
      refreshDeps: [appId, chatId, feedbackType, unreadOnly, refreshTrigger]
    }
  );

  const indices = useMemoEnhance(() => feedbackIndices?.indices || [], [feedbackIndices?.indices]);
  const total = feedbackIndices?.total || 0;

  // Update currentIndex if any feedback is currently in the view
  useEffect(() => {
    if (total === 0 || chatRecords.length === 0) {
      setCurrentIndex(-1);
      return;
    }

    // Find the first feedback item in the current window
    const loadedDataIds = new Set(chatRecords.map((r) => r.dataId));
    const foundIndex = indices.findIndex((item) => loadedDataIds.has(item.dataId));

    setCurrentIndex(foundIndex);
  }, [indices, chatRecords, total]);

  // Navigate to a specific index
  const navigateTo = useCallback(
    (newIndex: number) => {
      if (newIndex < 0 || newIndex >= indices.length) return;
      setCurrentIndex(newIndex);
      return indices[newIndex];
    },
    [indices]
  );

  const navigateToPrev = useCallback(() => {
    // if not focused, jump to last
    if (currentIndex === -1) {
      return navigateTo(indices.length - 1);
    }
    return navigateTo(currentIndex - 1);
  }, [currentIndex, navigateTo, indices.length]);

  const navigateToNext = useCallback(() => {
    // if not focused, jump to first
    if (currentIndex === -1) {
      return navigateTo(0);
    }
    return navigateTo(currentIndex + 1);
  }, [currentIndex, navigateTo]);

  const hasPrev = currentIndex === -1 ? total > 0 : currentIndex > 0;
  const hasNext = currentIndex === -1 ? total > 0 : currentIndex < indices.length - 1;

  return {
    currentIndex,
    total,
    indices,
    loading: indicesLoading,
    hasPrev,
    hasNext,
    navigateToPrev,
    navigateToNext
  };
};
