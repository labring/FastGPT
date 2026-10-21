import { Box, Flex } from '@chakra-ui/react';
import React from 'react';
import AIResponseBox from '../../../../components/AIResponseBox';
import ProcessingGroup from './ProcessingGroup';
import type { AIChatBubbleContentProps, IndexedAIChatValue } from './type';
import {
  hasAiAnswerContent,
  hasAiFoldableProcessingContent,
  hasAiInteractiveContent,
  hasAiProcessingContent,
  hasAiStandaloneProcessingContent
} from './utils';

/** 普通聊天沿用正文与交互之间的处理过程分组，不参与辅助生成的整轮分段。 */
const AIChatBubbleContent = (props: AIChatBubbleContentProps) => {
  const {
    chatValue,
    responseData,
    dataId,
    isLastChild,
    isChatting,
    allowedCitationIds,
    onOpenCiteModal
  } = props;
  const contentBlocks: React.ReactNode[] = [];
  let processingGroup: IndexedAIChatValue[] = [];

  /** 在正文、交互或独立过程内容之前收束连续的思考和工具调用。 */
  const flushProcessingGroup = () => {
    if (processingGroup.length === 0) return;

    const group = processingGroup;
    processingGroup = [];
    const hasFinishedContent = group.some(
      ({ value }) => hasAiAnswerContent(value) || hasAiInteractiveContent(value)
    );
    const isProcessing =
      isChatting &&
      isLastChild &&
      !hasFinishedContent &&
      group.some(({ index }) => index === chatValue.length - 1);

    contentBlocks.push(
      <ProcessingGroup
        key={`${dataId}-processing-${group[0].index}`}
        {...props}
        items={group}
        isProcessing={isProcessing}
      />
    );
  };

  chatValue.forEach((value, index) => {
    if (value.hideInUI) return;

    const hasProcessing = hasAiProcessingContent(value);
    const hasFoldableProcessing = hasAiFoldableProcessingContent(value);
    const hasStandaloneProcessing = hasAiStandaloneProcessingContent(value);
    const hasAnswer = hasAiAnswerContent(value);
    const hasInteractive = hasAiInteractiveContent(value);

    if (!hasProcessing && !hasAnswer && !hasInteractive && !value.workflowBuilderVersion) return;

    if (hasFoldableProcessing) {
      processingGroup.push({ value, index });
      if (!hasStandaloneProcessing && !hasAnswer && !hasInteractive) return;
    }

    flushProcessingGroup();
    contentBlocks.push(
      <Box key={`${dataId}-ai-${index}`}>
        <AIResponseBox
          chatItemDataId={dataId}
          value={value}
          responseData={responseData}
          isLastResponseValue={isLastChild && index === chatValue.length - 1}
          isLastChild={isLastChild}
          isChatting={isChatting}
          onOpenCiteModal={onOpenCiteModal}
          allowedCitationIds={allowedCitationIds}
          wrapProcessing={true}
          showFoldableProcessing={false}
          showStandaloneProcessing={hasStandaloneProcessing}
        />
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
