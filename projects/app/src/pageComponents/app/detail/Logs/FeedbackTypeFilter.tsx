import React, { useCallback, useEffect } from 'react';
import type { ButtonProps, PlacementWithLogical } from '@chakra-ui/react';
import {
  Checkbox,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Divider,
  Flex,
  Box,
  Button,
  useDisclosure
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getFeedbackRecordIds } from '@/web/core/chat/feedback/api';
import { eventBus, EventNameEnum } from '@/web/common/utils/eventbus';

type FilterProps = {
  feedbackType: 'all' | 'has_feedback' | 'good' | 'bad';
  setFeedbackType: (feedbackType: 'all' | 'has_feedback' | 'good' | 'bad') => void;
  unreadOnly: boolean;
  setUnreadOnly: (unreadOnly: boolean) => void;
  menuButtonProps?: ButtonProps;
  placement?: PlacementWithLogical;
};
const FeedbackTypeFilter = ({
  feedbackType,
  setFeedbackType,
  unreadOnly,
  setUnreadOnly,
  menuButtonProps,
  placement
}: FilterProps) => {
  const { t } = useTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const feedbackOptions = [
    {
      value: 'all' as const,
      label: t('app:logs_all_records')
    },
    {
      value: 'has_feedback' as const,
      label: t('app:logs_has_any_feedback')
    },
    {
      value: 'good' as const,
      label: t('app:logs_has_good_feedback')
    },
    {
      value: 'bad' as const,
      label: t('app:logs_has_bad_feedback')
    }
  ];

  return (
    <Menu
      isOpen={isOpen}
      onOpen={onOpen}
      onClose={onClose}
      closeOnSelect={false}
      strategy={'fixed'}
      autoSelect={false}
      placement={placement}
    >
      <MenuButton
        as={Button}
        variant={'grayGhost'}
        size="sm"
        rightIcon={<MyIcon name={'core/chat/chevronDown'} w={4} />}
        fontWeight={'normal'}
        {...menuButtonProps}
      >
        {feedbackType === 'all'
          ? t('app:logs_keys_feedback')
          : feedbackOptions.find((option) => option.value === feedbackType)?.label}
      </MenuButton>

      <MenuList
        minW={'120px'}
        w={'120px'}
        px={'6px'}
        py={'6px'}
        border={'1px solid #fff'}
        boxShadow={
          '0px 4px 10px 0px rgba(19, 51, 107, 0.10), 0px 0px 1px 0px rgba(19, 51, 107, 0.10)'
        }
        zIndex={99}
      >
        {/* Radio options */}
        {feedbackOptions.map((option) => (
          <MenuItem
            key={option.value}
            borderRadius="sm"
            py={2}
            px={3}
            fontSize={'sm'}
            fontWeight={'normal'}
            color={feedbackType === option.value ? 'primary.600' : 'myGray.900'}
            bg={feedbackType === option.value ? 'primary.50' : 'transparent'}
            _hover={{ bg: 'myGray.100' }}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();

              // When switching from "all" to other options, keep unreadOnly state
              // When switching to "all", unreadOnly state is preserved but ignored in query
              setFeedbackType(option.value);

              // Don't close the menu - allow user to continue selecting checkbox
            }}
          >
            <Flex alignItems={'center'} gap={2}>
              <Box
                w={'18px'}
                h={'18px'}
                borderWidth={'2.4px'}
                borderColor={feedbackType === option.value ? 'primary.015' : 'transparent'}
                borderRadius={'50%'}
              >
                <Flex
                  w={'100%'}
                  h={'100%'}
                  borderWidth={'1px'}
                  borderColor={feedbackType === option.value ? 'primary.600' : 'borderColor.high'}
                  bg={feedbackType === option.value ? 'primary.1' : 'transparent'}
                  borderRadius={'50%'}
                  alignItems={'center'}
                  justifyContent={'center'}
                >
                  <Box
                    w={'5px'}
                    h={'5px'}
                    borderRadius={'50%'}
                    bg={feedbackType === option.value ? 'primary.600' : 'transparent'}
                  />
                </Flex>
              </Box>
              {option.label}
            </Flex>
          </MenuItem>
        ))}

        {/* Divider + Checkbox (only show when feedbackType is not "all") */}
        {feedbackType !== 'all' && (
          <>
            <Divider my={2} borderColor="gray.200" />
            <MenuItem
              borderRadius="sm"
              py={2}
              _hover={{ bg: 'myGray.100' }}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setUnreadOnly(!unreadOnly);
              }}
              autoFocus={false}
            >
              <Checkbox isChecked={unreadOnly} size="sm" colorScheme="primary" pointerEvents="none">
                <Box fontSize={'sm'} fontWeight={'normal'} ml={0.5} whiteSpace={'nowrap'}>
                  {t('app:logs_unread_only')}
                </Box>
              </Checkbox>
            </MenuItem>
          </>
        )}
      </MenuList>
    </Menu>
  );
};

export default FeedbackTypeFilter;

// Enhanced FeedbackTypeFilter with navigation for DetailLogsModal
export const DetailLogsModalFeedbackTypeFilter = ({
  feedbackType,
  setFeedbackType,
  unreadOnly,
  setUnreadOnly,
  menuButtonProps,
  appId,
  chatId,
  currentRecordId,
  onRecordChange
}: FilterProps & {
  appId?: string;
  chatId?: string;
  currentRecordId?: string;
  onRecordChange?: (recordId: string | undefined) => void;
}) => {
  const { t } = useTranslation();

  // Get feedback record IDs when in feedback mode
  const { data: feedbackRecords, runAsync: loadFeedbackRecords } = useRequest2(
    async (_feedbackType = feedbackType, _unreadOnly = unreadOnly) => {
      if (!appId || !chatId || _feedbackType === 'all') return null;
      return await getFeedbackRecordIds({
        appId,
        chatId,
        feedbackType: _feedbackType,
        unreadOnly: _unreadOnly
      });
    },
    {
      manual: false,
      refreshDeps: [appId, chatId]
    }
  );

  // Calculate current position
  const currentIndex = feedbackRecords?.dataIds.findIndex((id) => id === currentRecordId) ?? -1;
  const currentPosition = currentIndex >= 0 ? currentIndex + 1 : 0;
  const totalCount = feedbackRecords?.total ?? 0;

  // Handle feedback type change
  const handleFeedbackTypeChange = useCallback(
    (type: 'all' | 'has_feedback' | 'good' | 'bad') => {
      setFeedbackType(type);

      if (type === 'all') {
        // Switch to all records - no feedbackRecordId
        loadFeedbackRecords(type);
      } else {
        loadFeedbackRecords(type).then((records) => {
          if (!records) return;
          // Select the last (latest) feedback record
          const lastRecordId = records.dataIds[records.dataIds.length - 1];
          onRecordChange?.(lastRecordId);
        });
      }
    },
    [setFeedbackType, onRecordChange, loadFeedbackRecords]
  );
  const handleUnreadOnlyChange = useCallback(
    (unreadOnly: boolean) => {
      setUnreadOnly(unreadOnly);
      loadFeedbackRecords(feedbackType, unreadOnly).then((records) => {
        if (!records) return;
        // Select the last (latest) feedback record
        const lastRecordId = records.dataIds[records.dataIds.length - 1];
        onRecordChange?.(lastRecordId);
      });
    },
    [setUnreadOnly, loadFeedbackRecords, feedbackType, onRecordChange]
  );

  // Navigation handlers
  const handlePrev = useCallback(() => {
    if (!feedbackRecords) return;
    if (currentIndex > 0) {
      onRecordChange?.(feedbackRecords.dataIds[currentIndex - 1]);
    } else {
      onRecordChange?.(feedbackRecords.dataIds[feedbackRecords.dataIds.length - 1]);
    }
  }, [feedbackRecords, currentIndex, onRecordChange]);

  const handleNext = useCallback(() => {
    if (!feedbackRecords) return;
    if (currentIndex < (feedbackRecords?.dataIds.length ?? 0) - 1) {
      onRecordChange?.(feedbackRecords.dataIds[currentIndex + 1]);
    } else {
      onRecordChange?.(feedbackRecords.dataIds[0]);
    }
  }, [feedbackRecords, currentIndex, onRecordChange]);

  const showNavigation = appId && chatId && feedbackType !== 'all';

  useEffect(() => {
    eventBus.on(EventNameEnum.refreshFeedback, () => {
      loadFeedbackRecords();
    });
    return () => {
      eventBus.off(EventNameEnum.refreshFeedback);
    };
  }, []);

  return (
    <Flex alignItems={'center'} gap={3} w={'100%'}>
      <FeedbackTypeFilter
        feedbackType={feedbackType}
        setFeedbackType={handleFeedbackTypeChange}
        unreadOnly={unreadOnly}
        setUnreadOnly={handleUnreadOnlyChange}
        menuButtonProps={menuButtonProps}
      />

      {showNavigation && (
        <>
          {/* Current position indicator */}
          <Box fontSize={'sm'} color={'myGray.600'} whiteSpace={'nowrap'} flex={1}>
            {currentPosition}/{totalCount}
          </Box>

          {/* Previous button */}
          <Button size="sm" w={'100px'} variant={'whiteBase'} onClick={handlePrev}>
            {t('chat:Previous')}
          </Button>
          <Button size="sm" w={'100px'} variant={'whiteBase'} onClick={handleNext}>
            {t('chat:Next')}
          </Button>
        </>
      )}
    </Flex>
  );
};
