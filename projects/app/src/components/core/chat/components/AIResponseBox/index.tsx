import { Box, Flex } from '@chakra-ui/react';
import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType
} from '@fastgpt/global/core/chat/type';
import { extractDeepestInteractive } from '@fastgpt/global/core/workflow/runtime/utils';
import React from 'react';
import { useContextSelector } from 'use-context-selector';
import {
  ChatItemContext,
  type OnOpenCiteModalProps
} from '@/web/core/chat/context/chatItemContext';
import RenderPaymentPauseInteractive from './RenderPaymentPauseInteractive';
import RenderPlan from './RenderPlan';
import RenderChatAgentBuilderVersion from './RenderChatAgentBuilderVersion';
import RenderPlanStatus from './RenderPlanStatus';
import RenderProcessingCollapse from './RenderProcessingCollapse';
import type { ProcessingPreviewTarget } from './RenderProcessingPreview';
import RenderReasoningContent from './RenderReasoningContent';
import RenderSkill from './RenderSkill';
import RenderText from './RenderText';
import RenderTool from './RenderTool';
import RenderUserFormInteractive from './RenderUserFormInteractive';
import RenderUserSelectInteractive from './RenderUserSelectInteractive';
import RenderWorkflowBuilderVersion from './WorkflowBuilder/RenderWorkflowBuilderVersion';
import RenderWorkflowBuilderPreview from './WorkflowBuilder/RenderWorkflowBuilderPreview';
import { useChatInstanceActions } from '../../ChatContainer/context/chatInstanceActionsContext';
import { QuickReplyContext } from '../../ChatContainer/context/quickReplyContext';
import { useMemoizedFn } from 'ahooks';

/** 在聊天边界绑定所属实例的操作，再以文本回调传入通用 Markdown 渲染器。 */
const AIResponseBox = ({
  chatItemDataId,
  value,
  responseData,
  isLastResponseValue,
  isLastChild,
  isChatting,
  onOpenCiteModal,
  allowedCitationIds,
  wrapProcessing = true,
  showProcessing = true,
  showFoldableProcessing: showFoldableProcessingProp = true,
  showStandaloneProcessing: showStandaloneProcessingProp = true,
  showAnswer = true,
  showInteractive = true,
  showWorkflowBuilderVersion = true,
  defaultExpandProcessing = true,
  defaultExpandedProcessingTarget
}: {
  chatItemDataId: string;
  value: AIChatItemValueItemType;
  responseData?: ChatHistoryItemResType[];
  isLastResponseValue: boolean;
  isLastChild: boolean;
  isChatting: boolean;
  onOpenCiteModal?: (e?: OnOpenCiteModalProps) => void;
  allowedCitationIds?: Set<string>;
  wrapProcessing?: boolean;
  showProcessing?: boolean;
  showFoldableProcessing?: boolean;
  showStandaloneProcessing?: boolean;
  showAnswer?: boolean;
  showInteractive?: boolean;
  showWorkflowBuilderVersion?: boolean;
  defaultExpandProcessing?: boolean;
  defaultExpandedProcessingTarget?: ProcessingPreviewTarget;
}) => {
  const showRunningStatus = useContextSelector(ChatItemContext, (v) => v.showRunningStatus);
  const showSkillReferences = useContextSelector(ChatItemContext, (v) => v.showSkillReferences);
  const { sendMessage, fillInput } = useChatInstanceActions();
  const onSendQuestion = useMemoizedFn((text: string) => sendMessage({ text }));
  const onEditQuestion = useMemoizedFn((text: string) => fillInput({ text }));
  const enableQuickReplies = useContextSelector(QuickReplyContext, (v) => v.enableQuickReplies);
  const onQuickReplyClick = useContextSelector(QuickReplyContext, (v) => v.onQuickReplyClick);
  const markdownActions = {
    onSendQuestion,
    onEditQuestion,
    onQuickReplyClick: enableQuickReplies ? onQuickReplyClick : undefined
  };
  const tools = (value.tools || (value.tool ? [value.tool] : undefined))?.filter(
    (tool) => !tool.hideInUI
  );
  const disableStreamingInteraction = isChatting && isLastChild;
  const skills = value.skills;
  const reasoningContent = value.reasoning?.content || '';
  const textContent = value.text?.content || '';

  if (value.hideInUI) return null;

  const responseBlocks: React.ReactNode[] = [];
  const foldableProcessingBlocks: React.ReactNode[] = [];
  const standaloneProcessingBlocks: React.ReactNode[] = [];

  const showFoldableProcessing = showProcessing && showFoldableProcessingProp;
  const showStandaloneProcessing = showProcessing && showStandaloneProcessingProp;

  if (showFoldableProcessing && reasoningContent && !value.hideReason) {
    foldableProcessingBlocks.push(
      <RenderReasoningContent
        {...markdownActions}
        key="reasoning"
        isChatting={isChatting}
        isLastResponseValue={isLastResponseValue && !textContent && !tools}
        content={reasoningContent}
        isDisabled={disableStreamingInteraction}
        defaultExpanded={
          defaultExpandedProcessingTarget?.type === 'reasoning' ||
          (defaultExpandProcessing && isLastResponseValue && !textContent && !tools)
        }
      />
    );
  }

  if (showFoldableProcessing && tools && showRunningStatus) {
    foldableProcessingBlocks.push(
      <Box key="tools">
        {tools.map((tool) => (
          <Box key={tool.id} _notLast={{ mb: 2 }}>
            <RenderTool
              showAnimation={isChatting}
              tool={tool}
              defaultExpanded={
                defaultExpandedProcessingTarget?.type === 'tool' &&
                defaultExpandedProcessingTarget.toolId === tool.id
              }
            />
          </Box>
        ))}
      </Box>
    );
  }

  if (showStandaloneProcessing && skills && showSkillReferences && showRunningStatus) {
    standaloneProcessingBlocks.push(
      <Box key="skills">
        {skills.map((skill) => (
          <Box key={skill.id} _notLast={{ mb: 2 }}>
            <RenderSkill skill={skill} />
          </Box>
        ))}
      </Box>
    );
  }

  if (showStandaloneProcessing && 'plan' in value && value.plan) {
    standaloneProcessingBlocks.push(<RenderPlan key="plan" plan={value.plan} />);
  }

  if (
    showStandaloneProcessing &&
    'planStatus' in value &&
    value.planStatus?.status === 'generating'
  ) {
    standaloneProcessingBlocks.push(
      <RenderPlanStatus key="planStatus" planStatus={value.planStatus} />
    );
  }

  if (foldableProcessingBlocks.length > 0) {
    if (wrapProcessing) {
      responseBlocks.push(
        <RenderProcessingCollapse
          key="processing"
          isProcessing={isChatting && isLastResponseValue && !textContent && !value.interactive}
        >
          {foldableProcessingBlocks}
        </RenderProcessingCollapse>
      );
    } else {
      responseBlocks.push(...foldableProcessingBlocks);
    }
  }

  responseBlocks.push(...standaloneProcessingBlocks);

  if (showAnswer && value.text && textContent) {
    responseBlocks.push(
      <RenderText
        {...markdownActions}
        key="text"
        chatItemDataId={chatItemDataId}
        showAnimation={isChatting && isLastResponseValue}
        text={textContent}
        onOpenCiteModal={onOpenCiteModal}
        allowedCitationIds={allowedCitationIds}
        isDisabled={disableStreamingInteraction}
      />
    );
  }

  if (showInteractive && 'interactive' in value && value.interactive) {
    const interactive = extractDeepestInteractive(value.interactive);
    if (interactive.type === 'userSelect') {
      responseBlocks.push(
        <RenderUserSelectInteractive key="interactive" interactive={interactive} />
      );
    }
    if (interactive.type === 'userInput') {
      responseBlocks.push(
        <RenderUserFormInteractive
          key="interactive"
          interactive={interactive}
          responseData={responseData}
          isLastChild={isLastChild}
        />
      );
    }
    if (interactive.type === 'paymentPause') {
      responseBlocks.push(
        <RenderPaymentPauseInteractive key="interactive" interactive={interactive} />
      );
    }
    if (interactive.type === 'workflowBuilderPreview') {
      responseBlocks.push(
        <RenderWorkflowBuilderPreview key="interactive" interactive={interactive} />
      );
    }
  }

  if (value.chatAgentBuilderVersion) {
    responseBlocks.push(
      <RenderChatAgentBuilderVersion
        key={`chatAgentBuilderVersion-${value.chatAgentBuilderVersion.s3Key}`}
        version={value.chatAgentBuilderVersion}
        responseChatItemId={chatItemDataId}
        isChatting={isChatting}
      />
    );
  }

  if (showWorkflowBuilderVersion && value.workflowBuilderVersion) {
    responseBlocks.push(
      <RenderWorkflowBuilderVersion
        key={`workflowBuilderVersion-${value.workflowBuilderVersion.checksum}-${value.workflowBuilderVersion.s3Key ?? 'ready'}-${value.workflowBuilderVersion.expiresAt ?? ''}`}
        version={value.workflowBuilderVersion}
        responseChatItemId={chatItemDataId}
      />
    );
  }

  if (responseBlocks.length === 1) {
    return responseBlocks[0];
  }

  if (responseBlocks.length > 1) {
    return (
      <Flex flexDirection={'column'} gap={2}>
        {responseBlocks}
      </Flex>
    );
  }

  return null;
};

export default React.memo(AIResponseBox);
