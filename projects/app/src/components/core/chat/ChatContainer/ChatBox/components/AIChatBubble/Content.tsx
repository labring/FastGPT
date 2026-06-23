import { Box, Flex } from '@chakra-ui/react';
import React from 'react';
import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType
} from '@fastgpt/global/core/chat/type';
import type { OnOpenCiteModalProps } from '@/web/core/chat/context/chatItemContext';
import AIResponseBox from '../../../../components/AIResponseBox';
import RenderProcessingCollapse from '../../../../components/AIResponseBox/RenderProcessingCollapse';
import RenderProcessingPreview, {
  getProcessingPreviewLabelKey
} from '../../../../components/AIResponseBox/RenderProcessingPreview';
import {
  hasAiAnswerContent,
  hasAiFoldableProcessingContent,
  hasAiInteractiveContent,
  hasAiProcessingContent,
  hasAiStandaloneProcessingContent
} from './utils';

type AIChatBubbleContentProps = {
  dataId: string;
  chatValue: AIChatItemValueItemType[];
  responseData?: ChatHistoryItemResType[];
  isLastChild: boolean;
  isChatting: boolean;
  allowedCitationIds?: Set<string>;
  onOpenCiteModal: (e?: OnOpenCiteModalProps) => void;
};

const AIChatBubbleContent = ({
  chatValue,
  responseData,
  dataId,
  isLastChild,
  isChatting,
  allowedCitationIds,
  onOpenCiteModal
}: AIChatBubbleContentProps) => {
  const renderValue = ({
    value,
    index,
    wrapProcessing,
    showProcessing = true,
    showFoldableProcessing,
    showStandaloneProcessing,
    showAnswer = true,
    showInteractive = true,
    defaultExpandProcessing = true
  }: {
    value: AIChatItemValueItemType;
    index: number;
    wrapProcessing: boolean;
    showProcessing?: boolean;
    showFoldableProcessing?: boolean;
    showStandaloneProcessing?: boolean;
    showAnswer?: boolean;
    showInteractive?: boolean;
    defaultExpandProcessing?: boolean;
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
        allowedCitationIds={allowedCitationIds}
        wrapProcessing={wrapProcessing}
        showProcessing={showProcessing}
        showFoldableProcessing={showFoldableProcessing}
        showStandaloneProcessing={showStandaloneProcessing}
        showAnswer={showAnswer}
        showInteractive={showInteractive}
        defaultExpandProcessing={defaultExpandProcessing}
      />
    );
  };

  const contentBlocks: React.ReactNode[] = [];
  let processingGroup: Array<{ value: AIChatItemValueItemType; index: number }> = [];

  const flushProcessingGroup = () => {
    if (processingGroup.length === 0) return;

    const group = processingGroup;
    processingGroup = [];
    const previewItem = group[group.length - 1];
    const hasFinishedContent = group.some(
      ({ value }) => hasAiAnswerContent(value) || hasAiInteractiveContent(value)
    );
    const isProcessing =
      isChatting &&
      isLastChild &&
      !hasFinishedContent &&
      group.some(({ index }) => index === chatValue.length - 1);

    contentBlocks.push(
      <Box key={`${dataId}-processing-${group[0].index}`}>
        <RenderProcessingCollapse
          isProcessing={isProcessing}
          label={previewItem ? getProcessingPreviewLabelKey(previewItem.value) : undefined}
          preview={
            previewItem ? (
              <RenderProcessingPreview value={previewItem.value} showAnimation={isProcessing} />
            ) : undefined
          }
        >
          {group.map(({ value, index }) => (
            <Box key={`${dataId}-ai-${index}`}>
              {renderValue({
                value,
                index,
                wrapProcessing: false,
                showAnswer: false,
                showInteractive: false,
                showStandaloneProcessing: false,
                defaultExpandProcessing: false
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
    const hasFoldableProcessing = hasAiFoldableProcessingContent(value);
    const hasStandaloneProcessing = hasAiStandaloneProcessingContent(value);
    const hasAnswer = hasAiAnswerContent(value);
    const hasInteractive = hasAiInteractiveContent(value);

    if (!hasProcessing && !hasAnswer && !hasInteractive) return;

    if (hasFoldableProcessing) {
      processingGroup.push({ value, index });

      if (!hasStandaloneProcessing && !hasAnswer && !hasInteractive) {
        return;
      }
    }

    flushProcessingGroup();

    contentBlocks.push(
      <Box key={`${dataId}-ai-${index}`}>
        {renderValue({
          value,
          index,
          wrapProcessing: true,
          showFoldableProcessing: false,
          showStandaloneProcessing: hasStandaloneProcessing
        })}
      </Box>
    );
  });

  flushProcessingGroup();

  return (
    <Flex flexDirection={'column'} gap={4} fontSize={'16px'} lineHeight={1.75}>
      {contentBlocks}
    </Flex>
  );
};

export default React.memo(AIChatBubbleContent);
