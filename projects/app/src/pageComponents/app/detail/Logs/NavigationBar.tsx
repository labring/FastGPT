import React, { useState, useCallback } from 'react';
import { Button, Flex, HStack, Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import type { ChatSiteItemType } from '@fastgpt/global/core/chat/type';
import FeedbackTypeFilter from './FeedbackTypeFilter';
import { useFeedbackNavigation } from '@/components/core/chat/ChatContainer/hooks/useFeedbackNavigation';
import { getChatRecords } from '@/web/core/chat/api';
import { ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { useContextSelector } from 'use-context-selector';
import { ChatRecordContext } from '@/web/core/chat/context/chatRecordContext';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';

type NavigationBarProps = {
  appId: string;
  chatId: string;
  onNavigate: (dataId: string) => void;
  refreshTrigger: boolean;
};

const NavigationBar = ({ appId, chatId, onNavigate, refreshTrigger }: NavigationBarProps) => {
  const { t } = useTranslation();

  const [feedbackType, setFeedbackType] = useState<'all' | 'good' | 'bad'>('all');
  const [unreadOnly, setUnreadOnly] = useState<boolean>(false);

  const chatRecords = useContextSelector(ChatRecordContext, (v) => v.chatRecords);
  const setChatRecords = useContextSelector(ChatRecordContext, (v) => v.setChatRecords);

  const { currentIndex, total, loading, hasPrev, hasNext, navigateToPrev, navigateToNext } =
    useFeedbackNavigation({
      appId,
      chatId,
      chatRecords,
      feedbackType,
      unreadOnly,
      refreshTrigger
    });

  const { runAsync: loadRecordsAround, loading: isLoadingRecords } = useRequest2(
    async (targetDataId: string) =>
      await getChatRecords({
        appId,
        chatId,
        targetDataId,
        offset: 0,
        pageSize: 10
      }),

    {
      manual: true,
      onSuccess: (result, params) => {
        const newRecords = result.list.map((item) => ({
          ...item,
          dataId: item.dataId || getNanoid(),
          status: ChatStatusEnum.finish
        })) as ChatSiteItemType[];

        setChatRecords(newRecords);

        setTimeout(() => {
          onNavigate(params[0]);
        }, 100);
      }
    }
  );

  const handleNavigate = useCallback(
    async (direction: 'prev' | 'next') => {
      const feedbackItem = direction === 'prev' ? navigateToPrev() : navigateToNext();
      if (!feedbackItem) return;

      const targetDataId = feedbackItem.dataId;
      const isLoaded = chatRecords.some((record) => record.dataId === targetDataId);

      if (isLoaded) {
        onNavigate(targetDataId);
      } else {
        await loadRecordsAround(targetDataId);
      }
    },
    [navigateToPrev, navigateToNext, chatRecords, onNavigate, loadRecordsAround]
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
            menuButtonProps={{
              color: 'myGray.700',
              _active: {}
            }}
          />
          <Box fontSize="sm" color="gray.600">
            {loading ? '' : `${currentIndex + 1} / ${total}`}
          </Box>
        </HStack>

        <HStack spacing={3}>
          <Button
            variant={'whitePrimary'}
            w={150}
            onClick={() => handleNavigate('prev')}
            isDisabled={!hasPrev || loading || isLoadingRecords}
            isLoading={loading || isLoadingRecords}
          >
            {t('chat:log.navigation.previous')}
          </Button>

          <Button
            variant={'whitePrimary'}
            w={150}
            onClick={() => handleNavigate('next')}
            isDisabled={!hasNext || loading || isLoadingRecords}
            isLoading={loading || isLoadingRecords}
          >
            {t('chat:log.navigation.next')}
          </Button>
        </HStack>
      </Flex>
    </Flex>
  );
};

export default NavigationBar;
