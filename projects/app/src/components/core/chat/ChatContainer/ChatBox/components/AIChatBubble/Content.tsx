import { Box, Flex } from '@chakra-ui/react';
import React from 'react';
import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType
} from '@fastgpt/global/core/chat/type';
import type { OnOpenCiteModalProps } from '@/web/core/chat/context/chatItemContext';
import AIResponseBox from '../../../../components/AIResponseBox';
import RenderProcessingCollapse from '../../../../components/AIResponseBox/RenderProcessingCollapse';
import {
  hasAiAnswerContent,
  hasAiInteractiveContent,
  hasAiProcessingContent
} from './utils';

type AIChatBubbleContentProps = {
  dataId: string;
  chatValue: AIChatItemValueItemType[];
  responseData?: ChatHistoryItemResType[];
  isLastChild: boolean;
  isChatting: boolean;
  onOpenCiteModal: (e?: OnOpenCiteModalProps) => void;
};

const AIChatBubbleContent = ({
  chatValue,
  responseData,
  dataId,
  isLastChild,
  isChatting,
  onOpenCiteModal
}: AIChatBubbleContentProps) => {
  const renderValue = ({
    value,
    index,
    wrapProcessing,
    showProcessing = true,
    showAnswer = true,
    showInteractive = true
  }: {
    value: AIChatItemValueItemType;
    index: number;
    wrapProcessing: boolean;
    showProcessing?: boolean;
    showAnswer?: boolean;
    showInteractive?: boolean;
  }) => {
    const isLastResponse = isLastChild && index === chatValue.length - 1;

    return (
      <AIResponseBox
        chatItemDataId={dataId}
        value={value}
        responseData={responseData}
        isLastResponseValue={isLastResponse}
        isLastChild={isLastChild}
        isChatting={isChatting}
        onOpenCiteModal={onOpenCiteModal}
        wrapProcessing={wrapProcessing}
        showProcessing={showProcessing}
        showAnswer={showAnswer}
        showInteractive={showInteractive}
      />
    );
  };

  const contentBlocks: React.ReactNode[] = [];
  let processingGroup: Array<{ value: AIChatItemValueItemType; index: number }> = [];

  const flushProcessingGroup = (isProcessing: boolean) => {
    if (processingGroup.length === 0) return;

    const group = processingGroup;
    processingGroup = [];

    if (group.length === 1) {
      const { value, index } = group[0];
      contentBlocks.push(
        <Box key={`${dataId}-ai-${index}`} _notFirst={{ mt: 4 }}>
          {renderValue({
            value,
            index,
            wrapProcessing: false,
            showAnswer: false,
            showInteractive: false
          })}
        </Box>
      );
      return;
    }

    contentBlocks.push(
      <Box key={`${dataId}-processing-${group[0].index}`} _notFirst={{ mt: 4 }}>
        <RenderProcessingCollapse isProcessing={isProcessing}>
          {group.map(({ value, index }) => (
            <Box key={`${dataId}-ai-${index}`} _notFirst={{ mt: 4 }}>
              {renderValue({
                value,
                index,
                wrapProcessing: false,
                showAnswer: false,
                showInteractive: false
              })}
            </Box>
          ))}
        </RenderProcessingCollapse>
      </Box>
    );
  };

  chatValue.forEach((value, index) => {
    if (value.hideInUI) return;

    const hasProcessing = hasAiProcessingContent(value);
    const hasAnswer = hasAiAnswerContent(value);
    const hasInteractive = hasAiInteractiveContent(value);

    if (!hasProcessing && !hasAnswer && !hasInteractive) return;

    if (hasProcessing) {
      processingGroup.push({ value, index });

      if (!hasAnswer && !hasInteractive) {
        return;
      }
    }

    flushProcessingGroup(isChatting && isLastChild && !hasAnswer && !hasInteractive);

    contentBlocks.push(
      <Box key={`${dataId}-ai-${index}`} _notFirst={{ mt: 4 }}>
        {renderValue({ value, index, wrapProcessing: true, showProcessing: false })}
      </Box>
    );
  });

  flushProcessingGroup(isChatting && isLastChild);

  return (
    <Flex flexDirection={'column'} fontSize={'16px'} lineHeight={1.75}>
      {contentBlocks}
    </Flex>
  );
};

export default React.memo(AIChatBubbleContent);
