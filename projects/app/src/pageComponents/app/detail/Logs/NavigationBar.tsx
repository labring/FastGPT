import React, { useState, useCallback } from 'react';
import { Button, Flex, HStack, Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type { ChatSiteItemType } from '@fastgpt/global/core/chat/type';
import type { FeedbackType } from '@/types/app';
import FeedbackTypeFilter from './FeedbackTypeFilter';
import { useFeedbackNavigation } from '@/components/core/chat/ChatContainer/hooks/useFeedbackNavigation';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getRecordsAround } from '@/web/core/chat/api';
import { ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';

type NavigationBarProps = {
  appId: string;
  chatId: string;
  chatRecords: ChatSiteItemType[];
  setChatRecords: React.Dispatch<React.SetStateAction<ChatSiteItemType[]>>;
  onNavigate: (dataId: string) => void;
  refreshTrigger: number;
};

const NavigationBar = ({
  appId,
  chatId,
  chatRecords,
  setChatRecords,
  onNavigate,
  refreshTrigger
}: NavigationBarProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isNavigating, setIsNavigating] = useState(false);

  const [feedbackType, setFeedbackType] = useState<FeedbackType>('all');
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);

  const { currentIndex, total, loading, hasPrev, hasNext, navigateToPrev, navigateToNext } =
    useFeedbackNavigation({
      appId,
      chatId,
      chatRecords,
      feedbackType,
      unreadOnly,
      refreshTrigger
    });

  const handleNavigate = useCallback(
    async (direction: 'prev' | 'next') => {
      const feedbackItem = direction === 'prev' ? navigateToPrev() : navigateToNext();
      if (!feedbackItem) return;

      const targetDataId = feedbackItem.dataId;
      const isLoaded = chatRecords.some((record) => record.dataId === targetDataId);

      if (isLoaded) {
        onNavigate(targetDataId);
      } else {
        setIsNavigating(true);
        try {
          const result = await getRecordsAround({
            appId,
            chatId,
            targetDataId,
            contextSize: 10
          });

          const newRecords = result.records.map((item) => ({
            ...item,
            dataId: item.dataId || getNanoid(),
            status: ChatStatusEnum.finish
          })) as ChatSiteItemType[];

          setChatRecords(newRecords);

          setTimeout(() => {
            onNavigate(targetDataId);
          }, 100);
        } catch (error) {
          console.error('Failed to load records:', error);
        } finally {
          setIsNavigating(false);
        }
      }
    },
    [
      navigateToPrev,
      navigateToNext,
      chatRecords,
      onNavigate,
      appId,
      chatId,
      setChatRecords,
      toast,
      t
    ]
  );

  return (
    <Flex bg="white" px={6} py={4} borderTop="1px solid" borderColor="gray.200">
      <Flex w="full" alignItems="center" justifyContent="space-between">
        <HStack spacing={2}>
          <FeedbackTypeFilter
            feedbackType={feedbackType}
            setFeedbackType={setFeedbackType}
            unreadOnly={unreadOnly}
            setUnreadOnly={setUnreadOnly}
          />
          <Box fontSize="sm" color="gray.600">
            {loading ? '' : currentIndex === -1 ? `? / ${total}` : `${currentIndex + 1} / ${total}`}
          </Box>
        </HStack>

        <HStack spacing={3}>
          <Button
            variant={'outline'}
            w={150}
            onClick={() => handleNavigate('prev')}
            isDisabled={!hasPrev || loading || isNavigating}
            isLoading={loading || isNavigating}
          >
            {t('common:log.navigation.previous')}
          </Button>

          <Button
            variant={'outline'}
            w={150}
            onClick={() => handleNavigate('next')}
            isDisabled={!hasNext || loading || isNavigating}
            isLoading={loading || isNavigating}
          >
            {t('common:log.navigation.next')}
          </Button>
        </HStack>
      </Flex>
    </Flex>
  );
};

export default NavigationBar;
