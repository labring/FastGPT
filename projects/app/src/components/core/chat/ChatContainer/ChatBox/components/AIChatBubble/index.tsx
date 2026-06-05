import { Box, useDisclosure } from '@chakra-ui/react';
import React from 'react';
import dynamic from 'next/dynamic';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { OnOpenCiteModalProps } from '@/web/core/chat/context/chatItemContext';
import type { ChatSiteItemType } from '../../type';
import AIChatBubbleContent from './Content';
import AIChatBubbleActions from './Actions';
import type { ChatControllerProps } from '../ChatController';
import { useContextSelector } from 'use-context-selector';
import { ChatBoxContext } from '../../Provider';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import AIChatLoading from '../AIChatLoading';

const ResponseTags = dynamic(() => import('../ResponseTags'));
const WholeResponseModal = dynamic(() => import('../../../../components/WholeResponseModal'));

export { shouldFilterAiValue } from './utils';

type AIChatBubbleProps = {
  chat: ChatSiteItemType;
  chatValue: AIChatItemValueItemType[];
  isPlanCard: boolean;
  isLastChild: boolean;
  isLastValueGroup: boolean;
  isChatting: boolean;
  loadingText?: string;
  questionGuides: string[];
  onOpenCiteModal: (e?: OnOpenCiteModalProps) => void;
  chatControllerProps: ChatControllerProps;
  children?: React.ReactNode;
};

const AIChatBubble = ({
  chat,
  chatValue,
  isPlanCard,
  isLastChild,
  isLastValueGroup,
  isChatting,
  loadingText,
  questionGuides,
  onOpenCiteModal,
  chatControllerProps,
  children
}: AIChatBubbleProps) => {
  const chatType = useContextSelector(ChatBoxContext, (v) => v.chatType);
  const showWholeResponse = useContextSelector(ChatItemContext, (v) => v.showWholeResponse ?? true);
  const {
    isOpen: isOpenWholeModal,
    onOpen: onOpenWholeModal,
    onClose: onCloseWholeModal
  } = useDisclosure();
  const showFooterActions = isLastValueGroup && (!isLastChild || !isChatting);
  const canShowWholeResponse = chatType !== 'share' && showWholeResponse;
  const showLoading = isLastChild && isLastValueGroup && isChatting;

  return (
    <Box position={'relative'} w={'100%'} maxW={'100%'}>
      <Box
        w={'100%'}
        maxW={'700px'}
        color={'myGray.900'}
        textAlign={'left'}
        minW={isPlanCard ? ['100%', '50%'] : undefined}
      >
        <AIChatBubbleContent
          chatValue={chatValue}
          responseData={chat.responseData}
          dataId={chat.dataId}
          isLastChild={isLastChild && isLastValueGroup}
          isChatting={isChatting}
          onOpenCiteModal={onOpenCiteModal}
        />
        {isLastValueGroup && (
          <ResponseTags
            showTags={!isLastChild || !isChatting}
            historyItem={chat}
            onOpenCiteModal={onOpenCiteModal}
            showFooterMeta={false}
          />
        )}
        {children}
        {showLoading && (
          <Box mt={3}>
            <AIChatLoading text={loadingText} size={'md'} />
          </Box>
        )}
      </Box>
      {showFooterActions && (
        <AIChatBubbleActions
          chatControllerProps={chatControllerProps}
          questionGuides={isLastChild ? questionGuides : []}
          showWholeResponse={canShowWholeResponse}
          onOpenWholeModal={onOpenWholeModal}
          durationSeconds={chat.durationSeconds || 0}
        />
      )}
      {isOpenWholeModal && <WholeResponseModal dataId={chat.dataId} onClose={onCloseWholeModal} />}
    </Box>
  );
};

export default React.memo(AIChatBubble);
