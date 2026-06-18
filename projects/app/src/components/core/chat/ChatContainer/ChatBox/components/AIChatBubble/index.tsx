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
import { hasAiAnswerContent, hasAiInteractiveContent, hasAiProcessingContent } from './utils';
import { useTranslation } from 'next-i18next';

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
  allowedCitationIds?: Set<string>;
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
  allowedCitationIds,
  onOpenCiteModal,
  chatControllerProps,
  children
}: AIChatBubbleProps) => {
  const { t } = useTranslation();
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
  const hasFinalOutput = chatValue.some(
    (item) => hasAiAnswerContent(item) || hasAiInteractiveContent(item)
  );
  const hasProcessingContent = chatValue.some((item) => hasAiProcessingContent(item));
  const showNoOutputTip =
    isLastValueGroup && !isChatting && !chat.errorMsg && !chat.errorText && !hasFinalOutput;

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
          allowedCitationIds={allowedCitationIds}
          onOpenCiteModal={onOpenCiteModal}
        />
        {showNoOutputTip && (
          <Box
            mt={hasProcessingContent ? 4 : 0}
            fontSize="14px"
            lineHeight="20px"
            color="myGray.500"
          >
            {t('chat:no_output_content')}
          </Box>
        )}
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
          historyItem={chat}
          questionGuides={isLastChild ? questionGuides : []}
          showWholeResponse={canShowWholeResponse}
          onOpenWholeModal={onOpenWholeModal}
          durationSeconds={chat.durationSeconds || 0}
          responseData={chat.responseData}
        />
      )}
      {isOpenWholeModal && <WholeResponseModal dataId={chat.dataId} onClose={onCloseWholeModal} />}
    </Box>
  );
};

export default React.memo(AIChatBubble);
