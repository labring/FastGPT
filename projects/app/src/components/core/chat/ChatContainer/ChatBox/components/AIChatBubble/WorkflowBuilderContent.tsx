import { Box, Flex } from '@chakra-ui/react';
import React from 'react';
import { useTranslation } from 'next-i18next';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import AIResponseBox from '../../../../components/AIResponseBox';
import RenderProcessingCollapse from '../../../../components/AIResponseBox/RenderProcessingCollapse';
import RenderProcessingPreview, {
  getProcessingPreviewLabel
} from '../../../../components/AIResponseBox/RenderProcessingPreview';
import ProcessingGroup from './ProcessingGroup';
import type { AIChatBubbleContentProps, IndexedAIChatValue } from './type';
import {
  getWorkflowBuilderDisplayBlocks,
  hasAiAnswerContent,
  hasAiFoldableProcessingContent,
  hasAiProcessingContent,
  hasAiStandaloneProcessingContent,
  type WorkflowBuilderDisplayBlock
} from './utils';

/** 辅助生成按交互边界折叠中间过程，最终正文、交互和工作流版本各自在外层展示一次。 */
const WorkflowBuilderContent = (props: AIChatBubbleContentProps) => {
  const {
    chatValue,
    responseData,
    dataId,
    isLastChild,
    isChatting,
    allowedCitationIds,
    onOpenCiteModal
  } = props;
  const { t } = useTranslation('workflow');
  const { t: safeT } = useSafeTranslation();
  const displayBlocks = getWorkflowBuilderDisplayBlocks({
    chatValue,
    isGenerating: isChatting && isLastChild
  });

  /** 保留过程段内部的单轮折叠；最终 value 的思考仍属于过程，正文只在外层展示。 */
  const renderProcessContent = (
    block: Extract<WorkflowBuilderDisplayBlock, { type: 'process' }>
  ) => {
    const contentBlocks: React.ReactNode[] = [];
    const answerValueIndices = new Set(block.answerValueIndices);
    let processingGroup: IndexedAIChatValue[] = [];

    const flushProcessingGroup = () => {
      if (processingGroup.length === 0) return;

      const group = processingGroup;
      processingGroup = [];
      const hasFinishedContent = group.some(
        ({ value, index }) => answerValueIndices.has(index) && hasAiAnswerContent(value)
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

    block.valueIndices.forEach((index) => {
      const value = chatValue[index];
      const hasAnswer = answerValueIndices.has(index) && hasAiAnswerContent(value);
      const hasStandaloneProcessing = hasAiStandaloneProcessingContent(value);
      if (!hasAiProcessingContent(value) && !hasAnswer) return;

      if (hasAiFoldableProcessingContent(value)) {
        processingGroup.push({ value, index });
        if (!hasStandaloneProcessing && !hasAnswer) return;
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
            showAnswer={answerValueIndices.has(index)}
            showInteractive={false}
            showWorkflowBuilderVersion={false}
          />
        </Box>
      );
    });
    flushProcessingGroup();
    return contentBlocks;
  };

  return (
    <Flex flexDirection={'column'} gap={4} fontSize={'16px'} lineHeight={1.75}>
      {displayBlocks.map((block) => {
        if (block.type === 'process') {
          const previewValue = block.valueIndices
            .map((index) => chatValue[index])
            .findLast(hasAiProcessingContent);

          return (
            <Box key={`${dataId}-workflow-builder-processing-${block.startIndex}`}>
              <RenderProcessingCollapse
                title={t('workflow_builder_process_details')}
                isProcessing={block.isProcessing}
                label={previewValue ? getProcessingPreviewLabel(previewValue, safeT) : undefined}
                preview={
                  previewValue ? (
                    <RenderProcessingPreview
                      value={previewValue}
                      showAnimation={block.isProcessing}
                    />
                  ) : undefined
                }
              >
                {renderProcessContent(block)}
              </RenderProcessingCollapse>
            </Box>
          );
        }

        const { valueIndex } = block;
        const value = chatValue[valueIndex];
        if (!value) return null;

        return (
          <Box key={`${dataId}-workflow-builder-${block.type}-${valueIndex}`}>
            <AIResponseBox
              chatItemDataId={dataId}
              value={value}
              responseData={responseData}
              isLastResponseValue={isLastChild && valueIndex === chatValue.length - 1}
              isLastChild={isLastChild}
              isChatting={isChatting}
              onOpenCiteModal={onOpenCiteModal}
              allowedCitationIds={allowedCitationIds}
              wrapProcessing={false}
              showProcessing={false}
              showAnswer={block.type === 'finalAnswer'}
              showInteractive={block.type === 'interactive'}
              showWorkflowBuilderVersion={block.type === 'version'}
            />
          </Box>
        );
      })}
    </Flex>
  );
};

export default React.memo(WorkflowBuilderContent);
