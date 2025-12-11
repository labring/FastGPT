import { useState, useCallback, useEffect } from 'react';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getFeedbackIndices } from '@/web/core/chat/api';
import type { ChatSiteItemType } from '@fastgpt/global/core/chat/type';
import type { FeedbackType } from '@/types/app';

type UseFeedbackNavigationProps = {
  appId: string;
  chatId: string;
  chatRecords: ChatSiteItemType[];
  feedbackType: FeedbackType;
  unreadOnly?: boolean;
  refreshTrigger: number;
};

export const useFeedbackNavigation = ({
  appId,
  chatId,
  chatRecords,
  feedbackType,
  unreadOnly,
  refreshTrigger
}: UseFeedbackNavigationProps) => {
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

  const indices = feedbackIndices?.indices || [];
  const total = indices.length;

  // Update currentIndex if any feedback is currently in the view
  useEffect(() => {
    if (indices.length === 0 || chatRecords.length === 0) {
      setCurrentIndex(-1);
      return;
    }

    // Find the first feedback item in the current window
    const loadedDataIds = new Set(chatRecords.map((r) => r.dataId));
    const foundIndex = indices.findIndex((item) => loadedDataIds.has(item.dataId));

    setCurrentIndex(foundIndex);
  }, [indices, chatRecords]);

  // Navigate to a specific index
  const navigateTo = useCallback(
    (newIndex: number) => {
      if (newIndex < 0 || newIndex >= indices.length) return;
      setCurrentIndex(newIndex);
      return indices[newIndex];
    },
    [indices]
  );

  // Go to previous feedback
  const navigateToPrev = useCallback(() => {
    // If not focused (-1), jump to last
    if (currentIndex === -1) {
      return navigateTo(indices.length - 1);
    }
    return navigateTo(currentIndex - 1);
  }, [currentIndex, navigateTo, indices.length]);

  // Go to next feedback
  const navigateToNext = useCallback(() => {
    // If not focused (-1), jump to first
    if (currentIndex === -1) {
      return navigateTo(0);
    }
    return navigateTo(currentIndex + 1);
  }, [currentIndex, navigateTo]);

  // Navigation status
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
