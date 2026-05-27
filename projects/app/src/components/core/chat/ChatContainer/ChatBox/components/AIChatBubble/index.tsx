import { Card } from '@chakra-ui/react';
import React from 'react';
import dynamic from 'next/dynamic';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { OnOpenCiteModalProps } from '@/web/core/chat/context/chatItemContext';
import type { ChatSiteItemType } from '../../type';
import { MessageCardStyle } from '../../constants';
import AIChatBubbleContent from './Content';
import AIChatBubbleFooterCopy from './FooterCopy';

const ResponseTags = dynamic(() => import('../ResponseTags'));

export { shouldFilterAiValue } from './utils';

type AIChatBubbleProps = {
  chat: ChatSiteItemType;
  chatValue: AIChatItemValueItemType[];
  isPlanCard: boolean;
  isLastChild: boolean;
  isLastValueGroup: boolean;
  isChatting: boolean;
  questionGuides: string[];
  onOpenCiteModal: (e?: OnOpenCiteModalProps) => void;
  children?: React.ReactNode;
};

const AIChatBubble = ({
  chat,
  chatValue,
  isPlanCard,
  isLastChild,
  isLastValueGroup,
  isChatting,
  questionGuides,
  onOpenCiteModal,
  children
}: AIChatBubbleProps) => {
  return (
    <Card
      {...MessageCardStyle}
      bg={'myGray.50'}
      borderRadius={'0 8px 8px 8px'}
      textAlign={'left'}
      minW={isPlanCard ? ['calc(100% - 25px)', '50%'] : undefined}
    >
      <AIChatBubbleContent
        chatValue={chatValue}
        responseData={chat.responseData}
        dataId={chat.dataId}
        isLastChild={isLastChild && isLastValueGroup}
        isChatting={isChatting}
        questionGuides={questionGuides}
        onOpenCiteModal={onOpenCiteModal}
      />
      {isLastValueGroup && (
        <ResponseTags
          showTags={!isLastChild || !isChatting}
          historyItem={chat}
          onOpenCiteModal={onOpenCiteModal}
        />
      )}
      {children}
      <AIChatBubbleFooterCopy
        chatValue={chatValue}
        isLastChild={isLastChild}
        isChatting={isChatting}
      />
    </Card>
  );
};

export default React.memo(AIChatBubble);
