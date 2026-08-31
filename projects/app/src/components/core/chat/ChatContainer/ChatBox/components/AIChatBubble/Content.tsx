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
  getProcessingPreviewLabel
} from '../../../../components/AIResponseBox/RenderProcessingPreview';
import {
  hasAiAnswerContent,
  hasAiFoldableProcessingContent,
  hasAiInteractiveContent,
  hasAiProcessingContent,
  hasAiStandaloneProcessingContent,
  getWorkflowBuilderDisplayBlocks
} from './utils';
import { useTranslation } from 'next-i18next';

type AIChatBubbleContentProps = {
  dataId: string;
  chatValue: AIChatItemValueItemType[];
  responseData?: ChatHistoryItemResType[];
  isLastChild: boolean;
  isChatting: boolean;
  collapseIntermediateAgentResponses: boolean;
  allowedCitationIds?: Set<string>;
  onOpenCiteModal: (e?: OnOpenCiteModalProps) => void;
};

const AIChatBubbleContent = ({
  chatValue,
  responseData,
  dataId,
  isLastChild,
  isChatting,
  collapseIntermediateAgentResponses,
  allowedCitationIds,
  onOpenCiteModal
}: AIChatBubbleContentProps) => {
  const { t } = useTranslation('workflow');
  const renderValue = ({
    value,
    index,
    wrapProcessing,
    showProcessing = true,
    showFoldableProcessing,
    showStandaloneProcessing,
    showAnswer = true,
    showInteractive = true,
    showWorkflowBuilderVersion = true,
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
    showWorkflowBuilderVersion?: boolean;
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
        showWorkflowBuilderVersion={showWorkflowBuilderVersion}
        defaultExpandProcessing={defaultExpandProcessing}
      />
    );
  };

  const indexedChatValues = chatValue.map((value, index) => ({ value, index }));

  /** 保留原有单轮处理折叠，只允许调用方控制正文、交互和版本卡片是否进入当前层。 */
  const buildContentBlocks = ({
    items = indexedChatValues,
    shouldShowAnswer = () => true,
    showInteractive = true,
    showWorkflowBuilderVersion = true
  }: {
    items?: Array<{ value: AIChatItemValueItemType; index: number }>;
    shouldShowAnswer?: (index: number) => boolean;
    showInteractive?: boolean;
    showWorkflowBuilderVersion?: boolean;
  } = {}) => {
    const contentBlocks: React.ReactNode[] = [];
    let processingGroup: Array<{ value: AIChatItemValueItemType; index: number }> = [];

    const flushProcessingGroup = () => {
      if (processingGroup.length === 0) return;

      const group = processingGroup;
      processingGroup = [];
      const previewItem = group[group.length - 1];
      const hasFinishedContent = group.some(
        ({ value, index }) =>
          (shouldShowAnswer(index) && hasAiAnswerContent(value)) ||
          (showInteractive && hasAiInteractiveContent(value))
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
            label={previewItem ? getProcessingPreviewLabel(previewItem.value) : undefined}
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
                  showWorkflowBuilderVersion: false,
                  showStandaloneProcessing: false,
                  defaultExpandProcessing: false
                })}
              </Box>
            ))}
          </RenderProcessingCollapse>
        </Box>
      );
    };

    items.forEach(({ value, index }) => {
      if (value.hideInUI) return;

      const hasProcessing = hasAiProcessingContent(value);
      const hasFoldableProcessing = hasAiFoldableProcessingContent(value);
      const hasStandaloneProcessing = hasAiStandaloneProcessingContent(value);
      const hasAnswer = shouldShowAnswer(index) && hasAiAnswerContent(value);
      const hasInteractive = showInteractive && hasAiInteractiveContent(value);
      const hasWorkflowBuilderVersion =
        showWorkflowBuilderVersion && Boolean(value.workflowBuilderVersion);

      if (!hasProcessing && !hasAnswer && !hasInteractive && !hasWorkflowBuilderVersion) return;

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
            showStandaloneProcessing: hasStandaloneProcessing,
            showAnswer: shouldShowAnswer(index),
            showInteractive,
            showWorkflowBuilderVersion
          })}
        </Box>
      );
    });

    flushProcessingGroup();
    return contentBlocks;
  };

  const contentBlocks = (() => {
    if (!collapseIntermediateAgentResponses) return buildContentBlocks();

    const isCurrentResponseGenerating = isChatting && isLastChild;
    const displayBlocks = getWorkflowBuilderDisplayBlocks({
      chatValue,
      isGenerating: isCurrentResponseGenerating
    });

    return displayBlocks.map((block) => {
      if (block.type === 'process') {
        const processItems = block.valueIndices.map((index) => indexedChatValues[index]);
        const answerValueIndices = new Set(block.answerValueIndices);
        const processBlocks = buildContentBlocks({
          items: processItems,
          // 最终 value 可能同时包含 reasoning/tool 与正文：过程仍保留，但正文只在外层展示一次。
          shouldShowAnswer: (index) => answerValueIndices.has(index),
          showInteractive: false,
          showWorkflowBuilderVersion: false
        });
        const previewItem = processItems.findLast(({ value }) => hasAiProcessingContent(value));

        return (
          <Box key={`${dataId}-workflow-builder-processing-${block.startIndex}`}>
            <RenderProcessingCollapse
              title={t('workflow_builder_process_details')}
              isProcessing={block.isProcessing}
              label={previewItem ? getProcessingPreviewLabel(previewItem.value) : undefined}
              preview={
                previewItem ? (
                  <RenderProcessingPreview
                    value={previewItem.value}
                    showAnimation={block.isProcessing}
                  />
                ) : undefined
              }
            >
              {processBlocks}
            </RenderProcessingCollapse>
          </Box>
        );
      }

      const { valueIndex } = block;
      const value = chatValue[valueIndex];
      if (!value) return null;

      if (block.type === 'finalAnswer') {
        return (
          <Box key={`${dataId}-workflow-builder-final-${valueIndex}`}>
            {renderValue({
              value,
              index: valueIndex,
              wrapProcessing: false,
              showProcessing: false,
              showAnswer: true,
              showInteractive: false,
              showWorkflowBuilderVersion: false
            })}
          </Box>
        );
      }

      if (block.type === 'interactive') {
        return (
          <Box key={`${dataId}-workflow-builder-interactive-${valueIndex}`}>
            {renderValue({
              value,
              index: valueIndex,
              wrapProcessing: false,
              showProcessing: false,
              showAnswer: false,
              showInteractive: true,
              showWorkflowBuilderVersion: false
            })}
          </Box>
        );
      }

      return (
        <Box key={`${dataId}-workflow-builder-version-${valueIndex}`}>
          {renderValue({
            value,
            index: valueIndex,
            wrapProcessing: false,
            showProcessing: false,
            showAnswer: false,
            showInteractive: false,
            showWorkflowBuilderVersion: true
          })}
        </Box>
      );
    });
  })();

  return (
    <Flex flexDirection={'column'} gap={4} fontSize={'16px'} lineHeight={1.75}>
      {contentBlocks}
    </Flex>
  );
};

export default React.memo(AIChatBubbleContent);
