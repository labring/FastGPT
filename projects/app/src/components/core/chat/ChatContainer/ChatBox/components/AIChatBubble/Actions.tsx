import { Box, Flex } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { EventNameEnum, eventBus } from '@/web/common/utils/eventbus';
import ChatController, { type ChatControllerProps } from '../ChatController';
import { ChatBoxContext } from '../../Provider';
import { useContextSelector } from 'use-context-selector';
import { ChatTypeEnum } from '../../constants';

type AIChatBubbleActionsProps = {
  chatControllerProps: ChatControllerProps;
  questionGuides: string[];
  showWholeResponse: boolean;
  onOpenWholeModal: () => void;
  durationSeconds: number;
};

const AIChatBubbleActions = ({
  chatControllerProps,
  questionGuides,
  showWholeResponse,
  onOpenWholeModal,
  durationSeconds
}: AIChatBubbleActionsProps) => {
  const { t } = useTranslation();
  const { onRetry } = chatControllerProps;
  const chatType = useContextSelector(ChatBoxContext, (v) => v.chatType);
  const showRetry = chatType !== ChatTypeEnum.log && !!onRetry;

  return (
    <Box mt={4} maxW={'100%'}>
      <Flex
        alignItems={'center'}
        flexWrap={'wrap'}
        color={'myGray.400'}
        fontSize={'12px'}
        fontWeight={500}
        lineHeight={'24px'}
        whiteSpace={'nowrap'}
        zIndex={1}
      >
        <Flex alignItems={'center'} gap={'4px'}>
          <ChatController {...chatControllerProps} variant="footer" />

          {showRetry && (
            <MyIcon
              name={'common/retryLight'}
              w={'16px'}
              p={'4px'}
              cursor={'pointer'}
              color={'myGray.400'}
              _hover={{ color: 'primary.600' }}
              onClick={onRetry}
            />
          )}

          {showWholeResponse && (
            <Flex
              alignItems={'center'}
              gap={'4px'}
              p={'4px'}
              cursor={'pointer'}
              color={'myGray.400'}
              _hover={{ color: 'primary.600' }}
              onClick={onOpenWholeModal}
            >
              <MyIcon name={'core/chat/terminal'} w={'16px'} />
              <Box>{t('chat:run_detail')}</Box>
            </Flex>
          )}
        </Flex>

        {durationSeconds > 0 && (
          <>
            <Box display={['none', 'block']} mx={4} h={'14px'} w={'1px'} bg={'myGray.200'} />
            <Box display={['none', 'block']} color={'myGray.400'}>
              {durationSeconds.toFixed(2)} s
            </Box>
          </>
        )}
      </Flex>

      {questionGuides.length > 0 && (
        <Flex mt={4} flexDirection={'column'} alignItems={'flex-start'} gap={'8px'}>
          {questionGuides.map((text) => (
            <Flex
              key={text}
              alignItems={'center'}
              gap={2}
              maxW={'100%'}
              px={['16px', '8px']}
              py={['8px', '4px']}
              borderRadius={'8px'}
              border={'0.5px solid'}
              borderColor={['myGray.250', 'transparent']}
              bg={'transparent'}
              color={'myGray.600'}
              fontSize={'14px'}
              lineHeight={'20px'}
              fontWeight={500}
              cursor={'pointer'}
              _hover={{ bg: 'rgba(17, 24, 36, 0.05)' }}
              onClick={() => eventBus.emit(EventNameEnum.sendQuestion, { text })}
            >
              <MyIcon name={'common/arrowRight'} w={'14px'} transform={'rotate(-45deg)'} />
              <Box className="textEllipsis">{text}</Box>
            </Flex>
          ))}
        </Flex>
      )}
    </Box>
  );
};

export default React.memo(AIChatBubbleActions);
